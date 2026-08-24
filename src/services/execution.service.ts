import fs from 'node:fs';
import path from 'node:path';
import { allPhaseBindings } from '../comfy/workflow-registry';
import { activeVersion } from '../lib/workflow-mapping-logic';
import { resolveMapping, ResolutionContext, UnresolvableMappingError } from '../lib/mapping-resolver';
import { sanitizeSegment } from '../lib/path-sanitize';
import { NotFoundError, BadRequestError } from '../errors/http.errors';
import { CharactersService } from './characters.service';
import { CharacterImagesService } from './character-images.service';
import { WorkflowMappingService } from './workflow-mapping.service';
import { CharacterRecord } from '../schemas/character.schema';
import { WorkflowVersion } from '../schemas/workflow-mapping.schema';
import { ComfyUIClient } from './comfyui-client.service';
import { ComfyUISocket } from './comfyui-socket.service';
import { BatchSubJob, JobError, JobStore, SingleJobRecord } from './job-store.service';

interface RawComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}
type RawComfyGraph = Record<string, RawComfyNode>;

export interface ExecutionServiceConfig {
  workflowMapping: WorkflowMappingService;
  characters: CharactersService;
  characterImages: CharacterImagesService;
  comfyClient: ComfyUIClient;
  socket: ComfyUISocket;
  jobStore: JobStore;
  /** Must match the persistent socket's own client_id — see the module doc comment. */
  clientId: string;
}

export interface SubmitResult {
  promptId: string;
}

export interface SubmitBatchResult {
  promptIds: string[];
}

export interface ExecutionService {
  submitSingle(characterSlug: string, phaseBindingKey: string): Promise<SubmitResult>;
  /** N independent /prompt submissions (startSeed + i), never one batched EmptyLatentImage
   *  call — see design doc §6. Always targets the 'casting_batch' phase binding. */
  submitCastingBatch(characterSlug: string, startSeed: number, count: number): Promise<SubmitBatchResult>;
}

function slotIdForPhaseBinding(phaseBindingKey: string): string {
  const binding = allPhaseBindings().find((b) => b.key === phaseBindingKey);
  if (!binding) throw new NotFoundError(`Unknown phase binding "${phaseBindingKey}"`);
  return binding.slotId;
}

/**
 * Ties together the mapping resolver, the ComfyUI HTTP client, the one persistent
 * ComfyUI websocket connection, and the job store into an actual "run this phase"
 * pipeline. This is the one place that submission and completion-listening meet:
 * every submit* call records which (character, phase-binding[, seed]) a prompt_id
 * belongs to, and the socket message handler set up here (not a per-call listener)
 * uses that to route each incoming progress/completion/error event back to the right
 * job (or casting-batch sub-job) record.
 *
 * A submitted prompt's client_id MUST equal the persistent socket's own client_id —
 * ComfyUI only routes execution events to the connection registered under that same
 * id, so this deliberately reuses one shared, configured clientId for both rather
 * than generating a fresh one per submission.
 */
export function createExecutionService(config: ExecutionServiceConfig): ExecutionService {
  const { workflowMapping, characters, characterImages, comfyClient, socket, jobStore, clientId } =
    config;

  // prompt_id -> which (character, phase-binding[, seed]) job/sub-job to update when a
  // socket message arrives for it. `seed` present means it's a casting-batch sub-job.
  // Only holds prompts submitted by this process instance — a stale entry from before a
  // restart is handled by Phase 8's reconciliation, not here.
  const promptOwners = new Map<
    string,
    { characterSlug: string; phaseBindingKey: string; seed?: number }
  >();

  socket.onMessage((message) => {
    const promptId = message.data?.prompt_id;
    if (typeof promptId !== 'string') return;

    const owner = promptOwners.get(promptId);
    if (!owner) return;

    handleMessage(owner, promptId, message).catch(() => {
      // Best-effort: a failure updating the job record for a progress/completion event
      // shouldn't crash the one shared socket listener other in-flight jobs depend on.
    });
  });

  async function handleMessage(
    owner: { characterSlug: string; phaseBindingKey: string; seed?: number },
    promptId: string,
    message: { type: string; data: Record<string, unknown> },
  ): Promise<void> {
    const { characterSlug, phaseBindingKey, seed } = owner;
    const record = jobStore.get(characterSlug, phaseBindingKey);
    if (!record) return;

    if (record.kind === 'single') {
      if (record.promptId !== promptId) return;
      await handleSingleMessage(characterSlug, phaseBindingKey, promptId, record, message);
      return;
    }

    if (seed === undefined) return;
    const subJob = record.subJobs.find((s) => s.seed === seed && s.promptId === promptId);
    if (!subJob) return;
    await handleBatchSubJobMessage(characterSlug, phaseBindingKey, promptId, record, subJob, message);
  }

  async function handleSingleMessage(
    characterSlug: string,
    phaseBindingKey: string,
    promptId: string,
    record: SingleJobRecord,
    message: { type: string; data: Record<string, unknown> },
  ): Promise<void> {
    if (message.type === 'progress') {
      const progress = parseProgress(message.data);
      await jobStore.set(characterSlug, phaseBindingKey, {
        ...record,
        status: 'running',
        progress: progress ?? record.progress,
      });
      return;
    }

    if (message.type === 'execution_error') {
      await jobStore.set(characterSlug, phaseBindingKey, {
        ...record,
        status: 'error',
        error: parseExecutionError(message.data),
      });
      promptOwners.delete(promptId);
      return;
    }

    if (message.type === 'executing' && message.data.node === null) {
      await completeSingle(characterSlug, phaseBindingKey, promptId, record);
      promptOwners.delete(promptId);
    }
  }

  async function handleBatchSubJobMessage(
    characterSlug: string,
    phaseBindingKey: string,
    promptId: string,
    record: { kind: 'batch'; submittedAt: string; subJobs: BatchSubJob[] },
    subJob: BatchSubJob,
    message: { type: string; data: Record<string, unknown> },
  ): Promise<void> {
    const replaceSubJob = (patch: Partial<BatchSubJob>) => ({
      ...record,
      subJobs: record.subJobs.map((s) => (s.promptId === promptId ? { ...s, ...patch } : s)),
    });

    if (message.type === 'progress') {
      const progress = parseProgress(message.data);
      await jobStore.set(
        characterSlug,
        phaseBindingKey,
        replaceSubJob({ status: 'running', progress: progress ?? subJob.progress }),
      );
      return;
    }

    if (message.type === 'execution_error') {
      await jobStore.set(
        characterSlug,
        phaseBindingKey,
        replaceSubJob({ status: 'error', error: parseExecutionError(message.data) }),
      );
      promptOwners.delete(promptId);
      return;
    }

    if (message.type === 'executing' && message.data.node === null) {
      await completeBatchSubJob(characterSlug, phaseBindingKey, promptId, subJob.seed, record);
      promptOwners.delete(promptId);
    }
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
      nodeId: typeof data.node_id === 'string' ? data.node_id : undefined,
    };
  }

  async function fetchResultImage(
    phaseBindingKey: string,
    promptId: string,
  ): Promise<Buffer | undefined> {
    const slotId = slotIdForPhaseBinding(phaseBindingKey);
    const mappingRecord = workflowMapping.get(slotId);
    const version = mappingRecord && activeVersion(mappingRecord);
    const resultOutput = version?.resultOutput;

    const historyEntry = await comfyClient.getHistoryEntry(promptId);
    const image = resultOutput
      ? historyEntry?.outputs[resultOutput.nodeId]?.images?.[resultOutput.outputIndex]
      : undefined;
    if (!historyEntry || !resultOutput || !image) return undefined;

    return comfyClient.viewImage(image.filename, image.subfolder, image.type);
  }

  async function completeSingle(
    characterSlug: string,
    phaseBindingKey: string,
    promptId: string,
    record: SingleJobRecord,
  ): Promise<void> {
    try {
      const bytes = await fetchResultImage(phaseBindingKey, promptId);
      if (!bytes) {
        await jobStore.set(characterSlug, phaseBindingKey, {
          ...record,
          status: 'error',
          error: { kind: 'execution', message: 'ComfyUI reported completion but no result image was found' },
        });
        return;
      }

      const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
      const stored = characterImages.storeWorkingFile(characterSlug, phaseBindingKey, 'image', dataUrl);

      await jobStore.set(characterSlug, phaseBindingKey, {
        ...record,
        status: 'done',
        resultPath: stored.relativePath,
      });
    } catch (err) {
      await jobStore.set(characterSlug, phaseBindingKey, {
        ...record,
        status: 'error',
        error: { kind: 'connection', message: err instanceof Error ? err.message : 'Unknown error' },
      });
    }
  }

  async function completeBatchSubJob(
    characterSlug: string,
    phaseBindingKey: string,
    promptId: string,
    seed: number,
    record: { kind: 'batch'; submittedAt: string; subJobs: BatchSubJob[] },
  ): Promise<void> {
    const replaceSubJob = (patch: Partial<BatchSubJob>) => ({
      ...record,
      subJobs: record.subJobs.map((s) => (s.promptId === promptId ? { ...s, ...patch } : s)),
    });

    try {
      const bytes = await fetchResultImage(phaseBindingKey, promptId);
      if (!bytes) {
        await jobStore.set(
          characterSlug,
          phaseBindingKey,
          replaceSubJob({
            status: 'error',
            error: { kind: 'execution', message: 'ComfyUI reported completion but no result image was found' },
          }),
        );
        return;
      }

      const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
      const relativePath = characterImages.storeCastingCandidate(characterSlug, seed, dataUrl);

      // The tile grid's initial (pre-SSE) render reads candidate.imagePath off the
      // character record itself — the job store only holds this while a run is in
      // flight, so a page reload after the process restarts still needs to see it.
      const character = characters.get(characterSlug);
      if (character) {
        characters.update(characterSlug, {
          castingCandidates: character.castingCandidates.map((c) =>
            c.seed === seed ? { ...c, imagePath: relativePath } : c,
          ),
        });
      }

      await jobStore.set(characterSlug, phaseBindingKey, replaceSubJob({ status: 'done', resultPath: relativePath }));
    } catch (err) {
      await jobStore.set(
        characterSlug,
        phaseBindingKey,
        replaceSubJob({
          status: 'error',
          error: { kind: 'connection', message: err instanceof Error ? err.message : 'Unknown error' },
        }),
      );
    }
  }

  function getActiveVersionOrThrow(phaseBindingKey: string): { slotId: string; version: WorkflowVersion } {
    const slotId = slotIdForPhaseBinding(phaseBindingKey);
    const mappingRecord = workflowMapping.get(slotId);
    const version = mappingRecord && activeVersion(mappingRecord);
    if (!version) throw new BadRequestError(`No active workflow mapped for "${phaseBindingKey}"`);
    return { slotId, version };
  }

  function getCharacterOrThrow(characterSlug: string): CharacterRecord {
    const character = characters.get(characterSlug);
    if (!character) throw new NotFoundError(`Character "${characterSlug}" not found`);
    return character;
  }

  /** Resolves the active mapping, clones the stored raw graph, uploads any resolved
   *  images/masks with a stable per-role filename, and splices every resolved value in —
   *  everything short of actually submitting, shared by both single and batch submission. */
  async function buildGraph(
    slotId: string,
    version: WorkflowVersion,
    character: CharacterRecord,
    phaseBindingKey: string,
    context: ResolutionContext,
  ): Promise<RawComfyGraph> {
    const rawGraph = workflowMapping.getRawGraph(slotId, version.version) as RawComfyGraph | undefined;
    if (!rawGraph) throw new BadRequestError(`No stored workflow graph for "${slotId}" v${version.version}`);

    let resolved;
    try {
      resolved = resolveMapping(version, character, characterImages, context);
    } catch (err) {
      if (err instanceof UnresolvableMappingError) throw new BadRequestError(err.message);
      throw err;
    }

    const graph: RawComfyGraph = JSON.parse(JSON.stringify(rawGraph));

    for (const mapping of resolved) {
      const node = graph[mapping.nodeId];
      if (!node) continue;
      node.inputs = node.inputs ?? {};

      if (mapping.resolved.kind === 'image') {
        const filename = `${sanitizeSegment(character.slug)}-${sanitizeSegment(phaseBindingKey)}-${sanitizeSegment(mapping.resolved.role)}${path.extname(mapping.resolved.filePath)}`;
        const buffer = fs.readFileSync(mapping.resolved.filePath);
        const uploaded = await comfyClient.uploadImage(buffer, filename, 'input', { overwrite: true });
        node.inputs[mapping.inputName] = uploaded.subfolder
          ? `${uploaded.subfolder}/${uploaded.name}`
          : uploaded.name;
      } else {
        // Every static/domain value in this mapping model is stored as a plain string
        // (an existing characteristic of NodeMapping.sourceValue, not something new
        // introduced here) — a widget input ComfyUI expects as a number/boolean will
        // still be spliced in as a string.
        node.inputs[mapping.inputName] = mapping.resolved.value;
      }
    }

    return graph;
  }

  async function submitSingle(characterSlug: string, phaseBindingKey: string): Promise<SubmitResult> {
    const { slotId, version } = getActiveVersionOrThrow(phaseBindingKey);
    const character = getCharacterOrThrow(characterSlug);

    const graph = await buildGraph(slotId, version, character, phaseBindingKey, {});
    const { promptId } = await comfyClient.submitPrompt(graph, clientId);
    promptOwners.set(promptId, { characterSlug, phaseBindingKey });

    await jobStore.set(characterSlug, phaseBindingKey, {
      kind: 'single',
      promptId,
      status: 'queued',
      progress: null,
      resultPath: null,
      error: null,
      submittedAt: new Date().toISOString(),
    });

    return { promptId };
  }

  async function submitCastingBatch(
    characterSlug: string,
    startSeed: number,
    count: number,
  ): Promise<SubmitBatchResult> {
    const phaseBindingKey = 'casting_batch';
    const { slotId, version } = getActiveVersionOrThrow(phaseBindingKey);
    const character = getCharacterOrThrow(characterSlug);

    const subJobs: BatchSubJob[] = [];
    const promptIds: string[] = [];

    // Submitted sequentially, not in parallel — N separate /prompt calls per the design
    // decision (never one batched EmptyLatentImage), and ComfyUI only executes one at a
    // time regardless, so there's no throughput cost to keeping this simple. The job
    // record is updated after each submission so a failure partway through still leaves
    // the already-submitted candidates correctly tracked, not silently lost.
    for (let i = 0; i < count; i += 1) {
      const seed = startSeed + i;
      const graph = await buildGraph(slotId, version, character, phaseBindingKey, { castingSeed: seed });
      const { promptId } = await comfyClient.submitPrompt(graph, clientId);

      promptOwners.set(promptId, { characterSlug, phaseBindingKey, seed });
      promptIds.push(promptId);
      subJobs.push({ seed, promptId, status: 'queued', progress: null, resultPath: null, error: null });

      await jobStore.set(characterSlug, phaseBindingKey, {
        kind: 'batch',
        submittedAt: new Date().toISOString(),
        subJobs: [...subJobs],
      });
    }

    return { promptIds };
  }

  return { submitSingle, submitCastingBatch };
}
