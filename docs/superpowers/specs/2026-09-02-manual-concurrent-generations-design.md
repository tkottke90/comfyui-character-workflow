# Manual Workspace — Concurrent Generations — Design

## Problem

Manual sessions today track generation state in one fixed job-store slot
per session (`jobStore.get(sessionId, 'run')`), and `submitGeneration`/
`submitBatch` both reject a new submission while that slot shows
`queued`/`running`. This was meant as a safety gate, but it has two real
problems, both confirmed live this session:

1. **A TOCTOU race**: the `isJobActive` check happens early, but the
   job-store write that actually "claims" the slot
   (`manual-execution.service.ts`'s `jobStore.set(sessionId, RUN_KEY, ...)`)
   happens much later — after an async session read, an async
   `updateSession` write, an async `resolveManualGraph` (which may upload
   images), and an async `comfyClient.submitPrompt` HTTP call. Two
   submissions close enough together can both pass the check before
   either claims the slot.
2. **A worse failure mode than "runs twice"**: because the slot is one
   fixed key per session, a second submission's `jobStore.set(...)`
   *overwrites* the first's record entirely. The first generation's
   completion message, when it eventually arrives, is checked against
   whatever's *currently* in that slot (now the second job's), sees a
   promptId mismatch, and silently no-ops — leaving the first generation
   stuck at `queued` forever, with no path to recovery (not even a
   restart's `reconcile()`, which only walks whatever's *currently* in the
   job store).

Separately, the user's stated intent is architectural, not just a bug
fix: ComfyUI is itself a queue, and manual's own batch feature already
proves this works (`submitBatch` submits N sequential `/prompt` calls with
no waiting between them). There's no reason a session should be limited
to one in-flight thing at a time — Generate and Run Batch should both
just queue another independently-tracked job, unbounded, exactly like
ComfyUI's own queue would accept.

## Design

### Job-store keying: one slot per job, not one per session

`ManualExecutionService`'s internal `RUN_KEY = 'run'` constant is deleted.
Every job-store key becomes the job's own id: `(sessionId, generationId)`
for a single generation, `(sessionId, batchId)` for a batch. This alone
fixes the slot-clobbering bug as a direct side effect — there's no shared
slot left for anything to clobber.

`isJobActive` and every call to it are deleted from `submitGeneration`/
`submitBatch` (`manual-execution.service.ts`) — with per-job keys, there's
nothing left to guard against. The existing `workflowFile`/`resultOutput`
precondition checks are unchanged. `submitBatch`'s own 1–16 clamp per
click is unaffected (that's a per-click limit, not a concurrency gate).

Every internal lookup that used the fixed key switches to deriving the
right key from context already on hand:
- `handleMessage`/`checkAlreadyCompletedSingle`/
  `checkAlreadyCompletedBatchSubJob`: use `owner.batchId ?? owner.generationId`
  (the `promptOwners` entry already carries this).
- `reconcile()`: drops its `phaseBindingKey !== RUN_KEY` filter entirely
  — `manualJobStore` is exclusively manual jobs (its own store, not shared
  with the character pipeline's `jobStore`), so every entry belongs to
  this domain by construction; there's nothing to filter out anymore.

### Concurrency-safety: serializing writes per session

Deliberately allowing concurrent jobs surfaces a real, previously-latent
race: two completions (or a submission and a completion) both doing
`const session = await manualWorkflows.getSession(id); ...; await
manualWorkflows.updateSession(id, {...})` for the *same* session can
interleave and lose one write. This existed in theory for a batch's own
sub-jobs before (rare in practice, since they complete somewhat
staggered) — deliberately encouraging concurrency makes it a live bug.

Fixed at the source, in `ManualWorkflowRegistry.updateSession`
(`manual-workflow.service.ts:178-189`), not just in the execution
service, since *any* two concurrent callers for the same session race
today — a small per-session promise-chain lock:

```ts
private updateLocks = new Map<string, Promise<unknown>>();

async updateSession(id: string, session: Partial<ManualWorkflowUpdateSession>) {
  const previous = this.updateLocks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => this.updateSessionLocked(id, session));
  this.updateLocks.set(id, next.catch(() => {}));
  return next;
}

private async updateSessionLocked(id: string, session: Partial<ManualWorkflowUpdateSession>) {
  // existing body of updateSession, unchanged, lines 179-189
}
```

Calls for the *same* session id are queued (one at a time, in call
order); calls for *different* sessions remain fully concurrent — this
benefits every caller of `updateSession` (field CRUD routes included),
not just this feature, since none of them were ever actually safe under
concurrent access.

### SSE: from one fixed slot to a multiplexed per-session stream

**`job-store.service.ts`** gains one additive capability alongside the
existing `onChange` (`job-store.service.ts:67`, unchanged): a broader
subscription scoped to an owner (session) rather than one exact key.
`set()` (currently lines 102-105) gains a second emit:

```ts
async set(characterSlug, phaseBindingKey, record) {
  await db.put(makeKey(characterSlug, phaseBindingKey), record);
  emitter.emit(makeKey(characterSlug, phaseBindingKey), record);
  emitter.emit(characterSlug, { phaseBindingKey, record });
},
```

and the `JobStore` interface (`job-store.service.ts:54-69`) gains:

```ts
onAnyChange(characterSlug: string, handler: (phaseBindingKey: string, record: JobRecord) => void): () => void;
```

implemented the same way `onChange` is (`emitter.on(characterSlug,
...)`, returning an unsubscribe). Purely additive — the character
pipeline keeps using `onChange` with one exact key; nothing about its
behavior changes.

**`GET /manual/:id/events`** (`manual.views.ts`, currently lines 146-167)
stops reading one fixed slot and instead pushes a snapshot of every
relevant job on any change:

```ts
router.get('/:id/events', async (req, res) => {
  const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  const snapshot = (justChangedKey?: string) =>
    req.app.manualJobStore.listAll()
      .filter((e) => e.characterSlug === session.id)
      .filter((e) => isJobActive(e.record) || e.phaseBindingKey === justChangedKey)
      .map((e) => e.record);

  const send = (justChangedKey?: string) => {
    res.write(`data: ${JSON.stringify({ jobs: snapshot(justChangedKey) })}\n\n`);
  };

  send();
  const unsubscribe = req.app.manualJobStore.onAnyChange(session.id, (key) => send(key));
  req.on('close', () => unsubscribe());
});
```

(`isJobActive` here is the same status-check helper already defined in
`manual-execution.service.ts` — exported for reuse rather than
duplicated.) Including "whichever job just changed" alongside "everything
still active" guarantees a job's final done/error transition is
delivered at least once, while already-settled jobs from the past don't
keep reappearing in every future broadcast. Unlike today, this
connection **never closes** on its own — new jobs can be submitted at any
point while the page is open, so it just keeps reporting "what's active
right now" for the page's whole lifetime (the client never calls
`source.close()` for this shape of stream).

**`public/sse-client.js`**: the message handler gains one new branch,
checked before the existing single-job logic — if `data.jobs` is an
array, run the existing `jobToTiles`/`patchTiles` (unchanged functions)
once per entry and return; otherwise fall through to today's single-job
handling completely unchanged (this is what Casting Batch and the three
character single-result pages keep using). The existing "tiles + a
single non-batch job" branch (added for manual's old fixed-slot model)
becomes dead code once manual's route switches to the array shape —
nothing else ever produced that shape — and is removed.

### Generation page & view handler

**`manual.views.ts`**'s `liveGenerations` (currently the `batchUnsettled`/
`batchSiblings` logic at lines 89-122) collapses to a plain filter — every
generation not yet settled, independent of any "which batch is most
recent" reasoning:

```ts
const liveGenerations = sessionJson.generations
  .filter((g) => g.status === 'queued' || g.status === 'running')
  .map((g) => ({ ...g, image: g.imageId ? imagesById[g.imageId] : undefined }));
```

**`generation.njk`**'s "Generating…" card tile loop and per-tile key
expression (`generation.seed if generation.batchId else generation.id`)
don't change — they already worked per-generation; they now just render
however many are actually active at once, in one flat grid (no per-job
grouping). The single Generate and Run Batch forms lose nothing (they
were never disabled by anything else) — they simply no longer risk a
rejected submission from the deleted `isJobActive` check.

### Explicitly out of scope

- Casting Batch's own SSE route/model — it has no concurrent-job
  requirement (one batch page = one batch), so migrating it to the
  multiplexed shape would be unrelated scope creep.
- Any cap on concurrent jobs — unbounded, matching "ComfyUI already
  handles this as a queue."
- Any change to the three character single-result pages' reload-based
  flow, or to `ExecutionService`'s own job-store usage.
- Any UI affordance for canceling one specific in-flight job.

## Testing

- `job-store.service.test.ts`: `onAnyChange(owner, handler)` fires on any
  key change under that owner and not for a different owner; doesn't
  interfere with an existing `onChange` subscriber on one specific key.
- `manual-workflow.service.test.ts`: two overlapping `updateSession` calls
  for the same session both land (fire both without awaiting the first,
  assert the final session reflects both changes) — regression test for
  the new per-session lock; confirm two different sessions' concurrent
  updates are not serialized against each other (both complete without
  waiting on one another — a timing-based check, or simply that neither
  throws/blocks unreasonably).
- `manual-execution.service.test.ts`: two `submitGeneration` calls back to
  back both succeed (no rejection) and complete independently, each
  ending up `done` with its own image; a batch and a lone generation
  submitted concurrently don't clobber each other's job-store entries or
  `session.generations` records.
- Manual verification via the `run` skill: click Generate twice without
  waiting, confirm two tiles appear and each resolves independently to
  its own image; click Generate then Run Batch, confirm all tiles track
  live in one flat grid; leave the Generation page's SSE connection open
  across two separate Generate clicks made minutes apart, confirming a
  single page load's connection keeps working for both.
