# Graceful Shutdown — Design

## Problem

`Application.shutdown`'s own JSDoc already promises "stops background
services, closes the HTTP server to drain in-flight requests, then exits
the process" — but the actual implementation
(`src/app.ts`) is just `process.exit(code)`, and nothing ever calls it:
there's no `SIGINT`/`SIGTERM` handler anywhere, so a normal Ctrl-C falls
through to Node's default signal disposition (immediate exit, no app-level
cleanup at all). Neither gap caused the duplicate-dev-server incident
diagnosed earlier in this session (an OS-delivered `SIGKILL`/`SIGTERM`
already force-closes every socket and file descriptor regardless of
app-level cleanup) — but it's worth fixing on its own merits: right now
the ComfyUI socket and both LMDB job stores never get an explicit,
intentional close.

## Design

**`src/app.ts`**: capture the `http.Server` `app.listen(...)` returns
(currently discarded) in a variable `App()`'s closure holds. Implement
`app.shutdown(code)`:

```ts
app.shutdown = (code = 1) => {
  void (async () => {
    await Promise.race([
      new Promise<void>((resolve) => {
        if (!server) { resolve(); return; }
        server.close(() => resolve());
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          app.logger.warn(
            `Shutdown: HTTP server did not drain within ${SHUTDOWN_GRACE_PERIOD_MS}ms ` +
              '(likely an open SSE connection) — forcing exit',
          );
          resolve();
        }, SHUTDOWN_GRACE_PERIOD_MS).unref();
      }),
    ]);

    app.comfySocket.close();
    await Promise.all([app.jobStore.close(), app.manualJobStore.close()]);

    process.exit(code);
  })();
};
```

`SHUTDOWN_GRACE_PERIOD_MS = 5000`. The race exists because this app has
long-lived SSE connections (character phase pages, manual generation
events) that `http.Server.close()`'s callback won't fire until they end —
without the timeout, leaving any such tab open would hang shutdown
forever. Whichever branch of the race wins, cleanup continues
identically; `process.exit(code)` at the end forces the OS to close
anything still open regardless.

The outer `shutdown` keeps its existing synchronous `(code?: number) =>
void` signature (`Application`'s type, unchanged) by wrapping the async
sequence in a fire-and-forget IIFE — callers don't await it, matching
today's call shape.

`ComfyUISocket.close()` and `JobStore.close()` already exist and do the
right thing (confirmed by reading both); this only wires them up at the
one point they were never called from. No changes to either service.

**Signal wiring**: inside `App()`, alongside where `shutdown` is defined:

```ts
process.on('SIGINT', () => app.shutdown(0));
process.on('SIGTERM', () => app.shutdown(0));
```

`App()` is only ever constructed from `src/index.ts` — confirmed no test
file calls it directly (they build their own bare `express()` apps via
`test/support/*-test-app.ts`) — so this can't accumulate duplicate
listeners across a mocha run.

### Explicitly out of scope

- Forcibly terminating already-open SSE connections before the timeout —
  the timeout + `process.exit` already reclaims them at the OS level.
- Any change to `Application.shutdown`'s type signature or JSDoc, which
  already documents this exact intended behavior.
- Anything related to the duplicate-dev-server/shared-`clientId` incident
  this session diagnosed separately — that was a process-hygiene issue
  (stale `npm run dev` instances never stopped), not a shutdown gap, and
  is unaffected by this change.

## Testing

Manual verification only — this is process-lifecycle behavior, not
easily unit-tested against the real LMDB/socket singletons without
duplicating most of `App()`'s own wiring:

- Start the dev server, Ctrl-C it with no SSE tab open — confirm it exits
  promptly (well under 5s) with no warning logged.
- Start it again, open a Casting Batch or manual Generation page (leaving
  an SSE connection open), then Ctrl-C — confirm the warning logs and the
  process still exits within ~5s via the timeout path rather than hanging
  indefinitely.
