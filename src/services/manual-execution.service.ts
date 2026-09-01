import crypto from 'node:crypto';
import { resolveManualGraph } from '../lib/manual-execution-resolver';
import { storeManualImage } from '../lib/manual-image-store';
import { BadRequestError } from '../errors/http.errors';
import { ManualGenerationSchema, ManualWorkflowRegistry, ManualWorkflowSession } from './manual-workflow.service';
import { ComfyUIClient } from './comfyui-client.service';
import { ComfyUISocket } from './comfyui-socket.service';
import { BatchSubJob, JobError, JobRecord, JobStore, SingleJobRecord } from './job-store.service';

export interface ManualExecutionServiceConfig {
  manualWorkflows: ManualWorkflowRegistry;
  comfyClient: ComfyUIClient;
  socket: ComfyUISocket;
  jobStore: JobStore;
  clientId: string;
}

export interface ManualExecutionService {
  submitGeneration(sessionId: string, seed: number): Promise<{ generationId: string }>;
  submitBatch(sessionId: string, start: number, count: number): Promise<{ batchId: string }>;
  /** Call once at process start — any manual job left queued/running belongs to a
   *  promptOwners entry that died with the previous process. */
  reconcile(): Promise<void>;
}

/** Which (session, generation[, batch]) a given promptId belongs to. Every job now has its
 *  own job-store slot — `generationId` for a lone generation, `batchId` for a batch — rather
 *  than sharing one fixed slot per session, so arbitrarily many jobs can be in flight for the
 *  same session at once without one clobbering another's tracking. */
interface JobOwner {
  sessionId: string;
  generationId: string;
  batchId?: string;
}

/** The job-store key for a given owner — a batch's own id if this is a batch sub-job,
 *  otherwise the lone generation's own id. */
function jobKeyFor(owner: JobOwner): string {
  return owner.batchId ?? owner.generationId;
}

export function isJobActive(record: JobRecord | undefined): boolean {
  if (!record) return false;
  if (record.kind === 'single') return record.status === 'queued' || record.status === 'running';
  return record.subJobs.some((s) => s.status === 'queued' || s.status === 'running');
}

function snapshotFields(
  session: ManualWorkflowSession
): Record<string, string | number | boolean | null> {
  const snapshot: Record<string, string | number | boolean | null> = {};
  for (const field of session.fields) {
    snapshot[field.key] = field.value;
  }
  return snapshot;
}

function parseProgress(data: Record<string, unknown>): { value: number; max: number } | undefined {
  const value = Number(data.value);
  const max = Number(data.max);
  return Number.isFinite(value) && Number.isFinite(max) ? { value, max } : undefined;
}

function parseExecutionError(data: Record<string, unknown>): JobError {
  return {
    kind: 'execution',
    message: String(data.exception_message ?? 'Execution failed'),
    nodeId: typeof data.node_id === 'string' ? data.node_id : undefined
  };
}

/**
 * Manual sessions' much smaller sibling of `execution.service.ts`'s `ExecutionService` —
 * no characters, phases, casting batches, or prompt adapters to thread through. Ties the
 * mapping resolver (`resolveManualGraph`) together with the shared `comfyClient`/`socket`
 * and a manual-specific `jobStore` instance into "resolve the graph, submit it, track
 * progress, write the result back into session.generations/images". Any number of jobs
 * (single generations and/or batches) can be in flight for the same session at once —
 * each gets its own job-store slot, keyed by its own generationId/batchId.
 */
export function createManualExecutionService(
  config: ManualExecutionServiceConfig
): ManualExecutionService {
  const { manualWorkflows, comfyClient, socket, jobStore, clientId } = config;

  // prompt_id -> which (session, generation[, batch]) to update when a socket message
  // arrives for it. Only holds prompts submitted by this process instance — a stale entry
  // from before a restart is handled by reconcile(), not here.
  const promptOwners = new Map<string, JobOwner>();

  socket.onMessage((message) => {
    const promptId = message.data?.prompt_id;
    if (typeof promptId !== 'string') return;

    const owner = promptOwners.get(promptId);
    if (!owner) return;

    handleMessage(owner, promptId, message).catch(() => {
      // Best-effort: a failure updating this job's record shouldn't crash the one shared
      // socket listener other in-flight jobs (character or manual) depend on.
    });
  });

  async function handleMessage(
    owner: JobOwner,
    promptId: string,
    message: { type: string; data: Record<string, unknown> }
  ): Promise<void> {
    const record = jobStore.get(owner.sessionId, jobKeyFor(owner));
    if (!record) return;

    if (record.kind === 'single') {
      if (record.promptId !== promptId) return;
      await handleSingleMessage(owner, promptId, record, message);
      return;
    }

    const subJob = record.subJobs.find((s) => s.promptId === promptId);
    if (!subJob) return;
    await handleBatchSubJobMessage(owner, promptId, record, subJob, message);
  }

  async function handleSingleMessage(
    owner: JobOwner,
    promptId: string,
    record: SingleJobRecord,
    message: { type: string; data: Record<string, unknown> }
  ): Promise<void> {
    if (message.type === 'progress') {
      const progress = parseProgress(message.data);
      await jobStore.set(owner.sessionId, owner.generationId, {
        ...record,
        status: 'running',
        progress: progress ?? record.progress
      });
      return;
    }

    if (message.type === 'execution_error') {
      const error = parseExecutionError(message.data);
      await jobStore.set(owner.sessionId, owner.generationId, { ...record, status: 'error', error });
      await markGenerationError(owner.sessionId, owner.generationId, error.message);
      promptOwners.delete(promptId);
      return;
    }

    if (message.type === 'executing' && message.data.node === null) {
      // Delete before awaiting anything — closes the race with the post-submit
      // already-completed check below: whichever of the two gets here first "claims"
      // the promptId, the other sees it already gone and no-ops.
      promptOwners.delete(promptId);
      await completeSingle(owner, promptId, record);
    }
  }

  async function handleBatchSubJobMessage(
    owner: JobOwner,
    promptId: string,
    record: { kind: 'batch'; submittedAt: string; subJobs: BatchSubJob[] },
    subJob: BatchSubJob,
    message: { type: string; data: Record<string, unknown> }
  ): Promise<void> {
    const replaceSubJob = (patch: Partial<BatchSubJob>) => ({
      ...record,
      subJobs: record.subJobs.map((s) => (s.promptId === promptId ? { ...s, ...patch } : s))
    });

    if (message.type === 'progress') {
      const progress = parseProgress(message.data);
      await jobStore.set(
        owner.sessionId,
        jobKeyFor(owner),
        replaceSubJob({ status: 'running', progress: progress ?? subJob.progress })
      );
      return;
    }

    if (message.type === 'execution_error') {
      const error = parseExecutionError(message.data);
      await jobStore.set(owner.sessionId, jobKeyFor(owner), replaceSubJob({ status: 'error', error }));
      await markGenerationError(owner.sessionId, owner.generationId, error.message);
      promptOwners.delete(promptId);
      return;
    }

    if (message.type === 'executing' && message.data.node === null) {
      promptOwners.delete(promptId);
      await completeBatchSubJob(owner, promptId, record);
    }
  }

  async function fetchResultImage(sessionId: string, promptId: string): Promise<Buffer | undefined> {
    const session = await manualWorkflows.getSession(sessionId);
    const resultOutput = session.resultOutput;
    if (!resultOutput) return undefined;

    const historyEntry = await comfyClient.getHistoryEntry(promptId);
    const image = historyEntry?.outputs[resultOutput.nodeId]?.images?.[resultOutput.outputIndex];
    if (!historyEntry || !image) return undefined;

    return comfyClient.viewImage(image.filename, image.subfolder, image.type);
  }

  async function markGenerationDone(sessionId: string, generationId: string, imageId: string): Promise<void> {
    await manualWorkflows.updateSession(sessionId, (current) => ({
      generations: current.generations.map((g) =>
        g.id === generationId ? { ...g, status: 'done' as const, imageId, completedAt: new Date() } : g
      )
    }));
  }

  async function markGenerationError(sessionId: string, generationId: string, message: string): Promise<void> {
    await manualWorkflows.updateSession(sessionId, (current) => ({
      generations: current.generations.map((g) =>
        g.id === generationId ? { ...g, status: 'error' as const, error: message, completedAt: new Date() } : g
      )
    }));
  }

  async function completeSingle(
    owner: JobOwner,
    promptId: string,
    record: SingleJobRecord
  ): Promise<void> {
    try {
      const bytes = await fetchResultImage(owner.sessionId, promptId);
      if (!bytes) {
        const message = 'ComfyUI reported completion but no result image was found';
        await jobStore.set(owner.sessionId, owner.generationId, {
          ...record,
          status: 'error',
          error: { kind: 'execution', message }
        });
        await markGenerationError(owner.sessionId, owner.generationId, message);
        return;
      }

      const session = await manualWorkflows.getSession(owner.sessionId);
      const image = await storeManualImage(
        manualWorkflows,
        session.id,
        session.workflowDir,
        bytes,
        'png'
      );
      await markGenerationDone(owner.sessionId, owner.generationId, image.id);
      await jobStore.set(owner.sessionId, owner.generationId, { ...record, status: 'done', resultPath: image.filename });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await jobStore.set(owner.sessionId, owner.generationId, {
        ...record,
        status: 'error',
        error: { kind: 'connection', message }
      });
      await markGenerationError(owner.sessionId, owner.generationId, message).catch(() => {});
    }
  }

  async function completeBatchSubJob(
    owner: JobOwner,
    promptId: string,
    record: { kind: 'batch'; submittedAt: string; subJobs: BatchSubJob[] }
  ): Promise<void> {
    const replaceSubJob = (patch: Partial<BatchSubJob>) => ({
      ...record,
      subJobs: record.subJobs.map((s) => (s.promptId === promptId ? { ...s, ...patch } : s))
    });

    try {
      const bytes = await fetchResultImage(owner.sessionId, promptId);
      if (!bytes) {
        const message = 'ComfyUI reported completion but no result image was found';
        await jobStore.set(
          owner.sessionId,
          jobKeyFor(owner),
          replaceSubJob({ status: 'error', error: { kind: 'execution', message } })
        );
        await markGenerationError(owner.sessionId, owner.generationId, message);
        return;
      }

      const session = await manualWorkflows.getSession(owner.sessionId);
      const image = await storeManualImage(
        manualWorkflows,
        session.id,
        session.workflowDir,
        bytes,
        'png'
      );
      await markGenerationDone(owner.sessionId, owner.generationId, image.id);
      await jobStore.set(owner.sessionId, jobKeyFor(owner), replaceSubJob({ status: 'done', resultPath: image.filename }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await jobStore.set(
        owner.sessionId,
        jobKeyFor(owner),
        replaceSubJob({ status: 'error', error: { kind: 'connection', message } })
      );
      await markGenerationError(owner.sessionId, owner.generationId, message).catch(() => {});
    }
  }

  /**
   * Guards against a real race: when every node in a submitted graph is a cache hit,
   * ComfyUI can finish (and broadcast completion over the already-open persistent
   * socket) within single-digit milliseconds — sometimes before `comfyClient.submitPrompt`
   * even returns here, meaning `promptOwners.set(...)` below hasn't run yet when the
   * completion message arrives. That message is then silently dropped (nothing owns
   * the promptId), leaving the job stuck "queued" until a process restart's reconcile()
   * happens to notice. This checks history once, immediately after submission, as a
   * catch-up for exactly that window — normally a no-op (history is empty because the
   * job is still genuinely in flight, and the live socket handler does the real work).
   */
  async function checkAlreadyCompletedSingle(sessionId: string, generationId: string, promptId: string): Promise<void> {
    if (!promptOwners.has(promptId)) return;

    let historyEntry;
    try {
      historyEntry = await comfyClient.getHistoryEntry(promptId);
    } catch {
      return; // transient — the live handler (or a future restart's reconcile) still covers it
    }
    if (!historyEntry) return;

    // Re-check and claim atomically (no await between the two) — if the live socket
    // handler completed this in the meantime, it already deleted the entry and we
    // correctly no-op instead of double-processing.
    const owner = promptOwners.get(promptId);
    if (!owner) return;
    promptOwners.delete(promptId);

    const record = jobStore.get(sessionId, generationId);
    if (!record || record.kind !== 'single' || record.promptId !== promptId) return;
    await completeSingle(owner, promptId, record);
  }

  /** Same guard as `checkAlreadyCompletedSingle`, for one batch sub-run. */
  async function checkAlreadyCompletedBatchSubJob(sessionId: string, batchId: string, promptId: string): Promise<void> {
    if (!promptOwners.has(promptId)) return;

    let historyEntry;
    try {
      historyEntry = await comfyClient.getHistoryEntry(promptId);
    } catch {
      return;
    }
    if (!historyEntry) return;

    const owner = promptOwners.get(promptId);
    if (!owner) return;
    promptOwners.delete(promptId);

    const record = jobStore.get(sessionId, batchId);
    if (!record || record.kind !== 'batch') return;
    const subJob = record.subJobs.find((s) => s.promptId === promptId);
    if (!subJob) return;
    await completeBatchSubJob(owner, promptId, record);
  }

  async function submitGeneration(sessionId: string, seed: number): Promise<{ generationId: string }> {
    const session = await manualWorkflows.getSession(sessionId);
    if (!session.workflowFile) throw new BadRequestError('No workflow attached to this session');
    if (!session.resultOutput) throw new BadRequestError('A result output must be set before generating');

    const generation = ManualGenerationSchema.parse({
      status: 'queued',
      fieldValuesSnapshot: snapshotFields(session),
      seed
    });
    // Functional update — any number of generations can be submitted concurrently now, and
    // each must append to whatever `generations` currently holds rather than the snapshot
    // taken above, or a concurrent submission's own append would be silently overwritten.
    await manualWorkflows.updateSession(sessionId, (current) => ({ generations: [...current.generations, generation] }));

    const graph = await resolveManualGraph(session, comfyClient, seed);
    const { promptId } = await comfyClient.submitPrompt(graph, clientId);

    promptOwners.set(promptId, { sessionId, generationId: generation.id });
    await jobStore.set(sessionId, generation.id, {
      kind: 'single',
      promptId,
      status: 'queued',
      progress: null,
      resultPath: null,
      error: null,
      submittedAt: new Date().toISOString(),
      generationId: generation.id
    });

    await checkAlreadyCompletedSingle(sessionId, generation.id, promptId);

    return { generationId: generation.id };
  }

  async function submitBatch(
    sessionId: string,
    start: number,
    count: number
  ): Promise<{ batchId: string }> {
    const session = await manualWorkflows.getSession(sessionId);
    if (!session.workflowFile) throw new BadRequestError('No workflow attached to this session');
    if (!session.resultOutput) throw new BadRequestError('A result output must be set before generating');

    const batchId = crypto.randomUUID();
    const generations = Array.from({ length: count }, (_, i) =>
      ManualGenerationSchema.parse({
        status: 'queued',
        batchId,
        fieldValuesSnapshot: snapshotFields(session),
        seed: start + i
      })
    );
    await manualWorkflows.updateSession(sessionId, (current) => ({
      generations: [...current.generations, ...generations]
    }));

    // Submitted sequentially, not in parallel — mirrors submitCastingBatch's own choice
    // (execution.service.ts): ComfyUI only executes one prompt at a time regardless, and
    // a failure partway through still leaves the already-submitted runs correctly tracked.
    const subJobs: BatchSubJob[] = [];
    for (let i = 0; i < count; i += 1) {
      const value = start + i;
      const graph = await resolveManualGraph(session, comfyClient, value);
      const { promptId } = await comfyClient.submitPrompt(graph, clientId);

      promptOwners.set(promptId, { sessionId, generationId: generations[i].id, batchId });
      subJobs.push({
        seed: value,
        promptId,
        status: 'queued',
        progress: null,
        resultPath: null,
        error: null,
        generationId: generations[i].id
      });

      await jobStore.set(sessionId, batchId, {
        kind: 'batch',
        submittedAt: new Date().toISOString(),
        subJobs: [...subJobs]
      });

      await checkAlreadyCompletedBatchSubJob(sessionId, batchId, promptId);
    }

    return { batchId };
  }

  async function reconcileSingle(sessionId: string, jobKey: string, record: SingleJobRecord): Promise<void> {
    let historyEntry;
    try {
      historyEntry = await comfyClient.getHistoryEntry(record.promptId);
    } catch (err) {
      await jobStore.set(sessionId, jobKey, {
        ...record,
        status: 'error',
        error: {
          kind: 'connection',
          message: err instanceof Error ? err.message : 'Could not reach ComfyUI after a restart'
        }
      });
      return;
    }

    if (historyEntry) {
      if (record.generationId) {
        await completeSingle({ sessionId, generationId: record.generationId }, record.promptId, record);
      }
      return;
    }

    promptOwners.set(record.promptId, { sessionId, generationId: record.generationId ?? '' });
  }

  async function reconcileBatchSubJob(
    sessionId: string,
    jobKey: string,
    record: { kind: 'batch'; submittedAt: string; subJobs: BatchSubJob[] },
    subJob: BatchSubJob
  ): Promise<void> {
    let historyEntry;
    try {
      historyEntry = await comfyClient.getHistoryEntry(subJob.promptId);
    } catch (err) {
      await jobStore.set(sessionId, jobKey, {
        ...record,
        subJobs: record.subJobs.map((s) =>
          s.promptId === subJob.promptId
            ? {
                ...s,
                status: 'error' as const,
                error: {
                  kind: 'connection' as const,
                  message: err instanceof Error ? err.message : 'Could not reach ComfyUI after a restart'
                }
              }
            : s
        )
      });
      return;
    }

    if (historyEntry) {
      if (subJob.generationId) {
        await completeBatchSubJob(
          { sessionId, generationId: subJob.generationId, batchId: jobKey },
          subJob.promptId,
          record
        );
      }
      return;
    }

    promptOwners.set(subJob.promptId, { sessionId, generationId: subJob.generationId ?? '', batchId: jobKey });
  }

  async function reconcile(): Promise<void> {
    for (const { characterSlug: sessionId, phaseBindingKey: jobKey, record } of jobStore.listAll()) {
      if (record.kind === 'single') {
        if (record.status !== 'queued' && record.status !== 'running') continue;
        await reconcileSingle(sessionId, jobKey, record);
        continue;
      }

      for (const subJob of record.subJobs) {
        if (subJob.status !== 'queued' && subJob.status !== 'running') continue;
        const latest = jobStore.get(sessionId, jobKey);
        if (latest?.kind !== 'batch') continue;
        const latestSubJob = latest.subJobs.find((s) => s.promptId === subJob.promptId);
        if (!latestSubJob || (latestSubJob.status !== 'queued' && latestSubJob.status !== 'running')) continue;
        await reconcileBatchSubJob(sessionId, jobKey, latest, latestSubJob);
      }
    }
  }

  return { submitGeneration, submitBatch, reconcile };
}
