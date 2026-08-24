import fs from 'node:fs';
import path from 'node:path';
import { allPhaseBindings } from '../comfy/workflow-registry';
import { activeVersion } from '../lib/workflow-mapping-logic';
import { resolveMapping, UnresolvableMappingError } from '../lib/mapping-resolver';
import { sanitizeSegment } from '../lib/path-sanitize';
import { NotFoundError, BadRequestError } from '../errors/http.errors';
import { CharactersService } from './characters.service';
import { CharacterImagesService } from './character-images.service';
import { WorkflowMappingService } from './workflow-mapping.service';
import { ComfyUIClient } from './comfyui-client.service';
import { ComfyUISocket } from './comfyui-socket.service';
import { JobStore, JobError, SingleJobRecord } from './job-store.service';

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

export interface ExecutionService {
  submitSingle(characterSlug: string, phaseBindingKey: string): Promise<SubmitResult>;
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
 * submitSingle() records which (character, phase-binding) a prompt_id belongs to,
 * and the socket message handler set up here (not a per-call listener) uses that to
 * route each incoming progress/completion/error event back to the right job record.
 *
 * A submitted prompt's client_id MUST equal the persistent socket's own client_id —
 * ComfyUI only routes execution events to the connection registered under that same
 * id, so this deliberately reuses one shared, configured clientId for both rather
 * than generating a fresh one per submission.
 */
export function createExecutionService(config: ExecutionServiceConfig): ExecutionService {
  const { workflowMapping, characters, characterImages, comfyClient, socket, jobStore, clientId } =
    config;

  // prompt_id -> which (character, phase-binding) job record to update when a socket
  // message arrives for it. Only holds prompts submitted by this process instance —
  // a stale entry from before a restart is handled by Phase 8's reconciliation, not here.
  const promptOwners = new Map<string, { characterSlug: string; phaseBindingKey: string }>();

  socket.onMessage((message) => {
    const promptId = message.data?.prompt_id;
    if (typeof promptId !== 'string') return;

    const owner = promptOwners.get(promptId);
    if (!owner) return;

    handleMessage(owner.characterSlug, owner.phaseBindingKey, promptId, message).catch(() => {
      // Best-effort: a failure updating the job record for a progress/completion event
      // shouldn't crash the one shared socket listener other in-flight jobs depend on.
    });
  });

  async function handleMessage(
    characterSlug: string,
    phaseBindingKey: string,
    promptId: string,
    message: { type: string; data: Record<string, unknown> },
  ): Promise<void> {
    const record = jobStore.get(characterSlug, phaseBindingKey);
    if (!record || record.kind !== 'single' || record.promptId !== promptId) return;

    if (message.type === 'progress') {
      const value = Number(message.data.value);
      const max = Number(message.data.max);
      await jobStore.set(characterSlug, phaseBindingKey, {
        ...record,
        status: 'running',
        progress: Number.isFinite(value) && Number.isFinite(max) ? { value, max } : record.progress,
      });
      return;
    }

    if (message.type === 'execution_error') {
      const error: JobError = {
        kind: 'execution',
        message: String(message.data.exception_message ?? 'Execution failed'),
        nodeId: typeof message.data.node_id === 'string' ? message.data.node_id : undefined,
      };
      await jobStore.set(characterSlug, phaseBindingKey, { ...record, status: 'error', error });
      promptOwners.delete(promptId);
      return;
    }

    // executing: {node: null} is the authoritative "fully finished" signal — more
    // reliable than 'executed', which can fire once per output node.
    if (message.type === 'executing' && message.data.node === null) {
      await completeJob(characterSlug, phaseBindingKey, promptId, record);
      promptOwners.delete(promptId);
    }
  }

  async function completeJob(
    characterSlug: string,
    phaseBindingKey: string,
    promptId: string,
    record: SingleJobRecord,
  ): Promise<void> {
    const slotId = slotIdForPhaseBinding(phaseBindingKey);
    const mappingRecord = workflowMapping.get(slotId);
    const version = mappingRecord && activeVersion(mappingRecord);

    try {
      const historyEntry = await comfyClient.getHistoryEntry(promptId);
      const resultOutput = version?.resultOutput;
      const image = resultOutput
        ? historyEntry?.outputs[resultOutput.nodeId]?.images?.[resultOutput.outputIndex]
        : undefined;

      if (!historyEntry || !resultOutput || !image) {
        await jobStore.set(characterSlug, phaseBindingKey, {
          ...record,
          status: 'error',
          error: { kind: 'execution', message: 'ComfyUI reported completion but no result image was found' },
        });
        return;
      }

      const bytes = await comfyClient.viewImage(image.filename, image.subfolder, image.type);
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

  async function submitSingle(characterSlug: string, phaseBindingKey: string): Promise<SubmitResult> {
    const slotId = slotIdForPhaseBinding(phaseBindingKey);

    const mappingRecord = workflowMapping.get(slotId);
    const version = mappingRecord && activeVersion(mappingRecord);
    if (!version) throw new BadRequestError(`No active workflow mapped for "${phaseBindingKey}"`);

    const character = characters.get(characterSlug);
    if (!character) throw new NotFoundError(`Character "${characterSlug}" not found`);

    const rawGraph = workflowMapping.getRawGraph(slotId, version.version) as RawComfyGraph | undefined;
    if (!rawGraph) throw new BadRequestError(`No stored workflow graph for "${slotId}" v${version.version}`);

    let resolved;
    try {
      resolved = resolveMapping(version, character, characterImages);
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
        const filename = `${sanitizeSegment(characterSlug)}-${sanitizeSegment(phaseBindingKey)}-${sanitizeSegment(mapping.resolved.role)}${path.extname(mapping.resolved.filePath)}`;
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

  return { submitSingle };
}
