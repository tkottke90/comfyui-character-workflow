import { Router, Request, Response } from 'express';
import { Application } from '../types/application';
import { ComfyUiConfigSchema } from '../schemas/config.schema';
import { ComfyUISocket } from '../services/comfyui-socket.service';
import {
  createComfyUIClient,
  getObjectInfoChoices,
  isImageUploadInput,
  ObjectInfo,
  verifyStaticMappings,
} from '../services/comfyui-client.service';
import {
  WorkflowMappingService,
  WorkflowSlotNotFoundError,
} from '../services/workflow-mapping.service';
import { BadRequestError, NotFoundError } from '../errors/http.errors';
import { parseJsonDataUrl } from '../lib/data-url';
import { suggestSlotId } from '../lib/comfyui-workflow';
import {
  getWorkflowSlot,
  getWorkflowSlotBySlug,
  requiredWorkflowSlots,
  slugifySlotId,
  WORKFLOW_SLOTS,
} from '../comfy/workflow-registry';
import { DOMAIN_FIELDS, IMAGE_DOMAIN_FIELD_PATHS } from '../comfy/domain-fields';
import {
  activeVersion,
  candidateOutputNodes,
  canActivateVersion,
  latestVersion,
  phaseBindingRows,
  requiredSlotCoverage,
  requiredSlotProgress,
  summarizeVersionStatus,
  unboundSlots,
} from '../lib/workflow-mapping-logic';
import { NodeMapping, WorkflowMappingRecord } from '../schemas/workflow-mapping.schema';

// 'computed' is deferred — its resolution semantics (a substitution DSL, and what
// non-character invocation context it would even draw from) are their own scope.
// The Zod enum backing NodeMapping.sourceType still allows it (so old/future data
// can't fail to parse), but this route-level allowlist is what actually keeps the
// editor and the execution engine from being handed a source type nothing resolves.
const SOURCE_TYPES = ['unset', 'domain', 'static'] as const;

const MODEL_GROUPS: Array<{
  title: string;
  entries: Array<{ classType: string; inputName: string }>;
}> = [
  {
    title: 'Diffusion models',
    entries: [
      { classType: 'CheckpointLoaderSimple', inputName: 'ckpt_name' },
      { classType: 'UNETLoader', inputName: 'unet_name' },
    ],
  },
  {
    title: 'LoRAs',
    entries: [
      { classType: 'LoraLoaderModelOnly', inputName: 'lora_name' },
      { classType: 'LoraLoader', inputName: 'lora_name' },
    ],
  },
  { title: 'VAE', entries: [{ classType: 'VAELoader', inputName: 'vae_name' }] },
  {
    title: 'CLIP',
    entries: [
      { classType: 'CLIPLoader', inputName: 'clip_name' },
      { classType: 'DualCLIPLoader', inputName: 'clip_name1' },
    ],
  },
];

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function emptyRecord(slotId: string): WorkflowMappingRecord {
  return { slug: slugifySlotId(slotId), slotId, versions: [] };
}

export function createIntegrationRouter(
  app: Application,
  workflowMapping: WorkflowMappingService,
  comfySocket: ComfyUISocket,
): Router {
  const router = Router();

  function getComfyConfig() {
    return app.config.loadConfig('comfy-ui', ComfyUiConfigSchema);
  }

  function getClient() {
    const cfg = getComfyConfig();
    return createComfyUIClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey || undefined });
  }

  router.get('/', (_req: Request, res: Response) => {
    res.redirect('/integration/connection');
  });

  router.get('/connection', async (req: Request, res: Response) => {
    const cfg = getComfyConfig();

    let status: {
      ok: boolean;
      systemStats?: Awaited<ReturnType<ReturnType<typeof getClient>['getSystemStats']>>;
      queue?: Awaited<ReturnType<ReturnType<typeof getClient>['getQueueStatus']>>;
      error?: string;
    } = { ok: false };

    try {
      const client = getClient();
      const [systemStats, queue] = await Promise.all([
        client.getSystemStats(),
        client.getQueueStatus(),
      ]);
      status = { ok: true, systemStats, queue };
    } catch (err) {
      status = { ok: false, error: err instanceof Error ? err.message : 'Unreachable' };
    }

    const progress = requiredSlotProgress(workflowMapping.list());
    const testResult = typeof req.query.testResult === 'string' ? req.query.testResult : undefined;
    const testError = typeof req.query.testError === 'string' ? req.query.testError : undefined;
    const freeResult = typeof req.query.freeResult === 'string' ? req.query.freeResult : undefined;
    const freeError = typeof req.query.freeError === 'string' ? req.query.freeError : undefined;

    res.render('integration/connection.njk', {
      section: 'integration',
      subsection: 'connection',
      baseUrl: cfg.baseUrl,
      clientId: cfg.clientId,
      hasApiKey: Boolean(cfg.apiKey),
      status,
      progress,
      testResult,
      testError,
      freeResult,
      freeError,
      wsStatus: {
        connected: comfySocket.isConnected(),
        exhausted: comfySocket.isExhausted(),
        attempts: comfySocket.getReconnectAttempts(),
      },
    });
  });

  router.post('/connection/ws-reset', (_req: Request, res: Response) => {
    comfySocket.reset();
    res.redirect('/integration/connection');
  });

  router.post('/connection', (req: Request, res: Response) => {
    const existing = getComfyConfig();

    const baseUrl = String(req.body.baseUrl ?? '').trim();
    if (!baseUrl) throw new BadRequestError('Base URL is required');

    const apiKeyInput = String(req.body.apiKey ?? '');
    const apiKey = apiKeyInput === '' ? existing.apiKey : apiKeyInput;

    const clientId = String(req.body.clientId ?? '').trim() || existing.clientId;

    app.config.updateSection('comfy-ui', { baseUrl, apiKey, clientId });
    res.redirect('/integration/connection');
  });

  router.post('/connection/test', async (_req: Request, res: Response) => {
    const result = await getClient().testConnection();
    const params = new URLSearchParams({ testResult: result.ok ? 'ok' : 'error' });
    if (result.error) params.set('testError', result.error);
    res.redirect(`/integration/connection?${params.toString()}`);
  });

  router.post('/connection/free-memory', async (_req: Request, res: Response) => {
    const params = new URLSearchParams();
    try {
      await getClient().freeMemory();
      params.set('freeResult', 'ok');
    } catch (err) {
      params.set('freeResult', 'error');
      params.set('freeError', err instanceof Error ? err.message : 'Unknown error');
    }
    res.redirect(`/integration/connection?${params.toString()}`);
  });

  router.get('/workflow-mapping', (_req: Request, res: Response) => {
    const records = workflowMapping.list();

    const rows = records
      .filter((record) => record.versions.length > 0)
      .map((record) => {
        const slot = getWorkflowSlot(record.slotId);
        const version = activeVersion(record) ?? latestVersion(record);
        if (!slot || !version) return undefined;

        return {
          slug: record.slug,
          slotId: record.slotId,
          label: slot.label,
          phaseLabel: slot.phaseBindings.map((b) => b.label).join(', ') || '—',
          filename: version.filename,
          version: version.version,
          status: summarizeVersionStatus(version),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== undefined);

    const coverage = requiredSlotCoverage(records);

    res.render('integration/workflow-mapping.njk', {
      section: 'integration',
      subsection: 'workflow-mapping',
      rows,
      phaseBindings: phaseBindingRows(records),
      unbound: unboundSlots(records),
      coverage,
      importedCount: coverage.active + coverage.flagged,
      requiredSlots: requiredWorkflowSlots(),
      allSlots: WORKFLOW_SLOTS,
      hasAnyImports: rows.length > 0,
    });
  });

  async function renderMappingDetail(req: Request, res: Response) {
    const slugParam = param(req, 'slug');
    const slot = getWorkflowSlotBySlug(slugParam);
    if (!slot) throw new NotFoundError(`Unknown workflow "${slugParam}"`);

    const slug = slugifySlotId(slot.id);
    const allRecords = workflowMapping.list();
    const record = workflowMapping.get(slot.id) ?? emptyRecord(slot.id);

    const requestedVersion = req.params.version ? Number(param(req, 'version')) : undefined;
    const version = requestedVersion
      ? record.versions.find((v) => v.version === requestedVersion)
      : (activeVersion(record) ?? latestVersion(record));

    const editingKey = typeof req.query.editing === 'string' ? req.query.editing : undefined;

    let objectInfo: ObjectInfo = {};
    let comfyUnreachable = false;
    try {
      objectInfo = await getClient().getObjectInfo();
    } catch {
      comfyUnreachable = true;
    }

    let editingNode: NodeMapping | undefined;
    let editingOptions: string[] = [];
    let editingDomainFields = DOMAIN_FIELDS;
    if (editingKey && version) {
      const [nodeId, inputName] = editingKey.split(':');
      editingNode = version.nodes.find((n) => n.nodeId === nodeId && n.inputName === inputName);
      if (editingNode) {
        editingOptions = getObjectInfoChoices(objectInfo, editingNode.classType, editingNode.inputName);

        // Current Image/Current Mask only ever make sense on an input ComfyUI itself
        // flags as wanting an uploaded file — hide them everywhere else rather than
        // let them be mapped onto e.g. a seed or a checkpoint name.
        if (!isImageUploadInput(objectInfo, editingNode.classType, editingNode.inputName)) {
          editingDomainFields = DOMAIN_FIELDS.filter(
            (field) => !IMAGE_DOMAIN_FIELD_PATHS.has(field.path),
          );
        }
      }
    }

    const uniqueNodeIds = version ? Array.from(new Set(version.nodes.map((n) => n.nodeId))) : [];
    const outputNodeCandidates = version ? candidateOutputNodes(version) : [];

    res.render('integration/workflow-mapping-detail.njk', {
      section: 'integration',
      subsection: 'workflow-mapping',
      slot,
      slug,
      record,
      version,
      uniqueNodeIds,
      outputNodeCandidates,
      editingKey,
      editingNode,
      editingOptions,
      comfyUnreachable,
      domainFields: editingDomainFields,
      phaseBindings: phaseBindingRows(allRecords),
      allRecords,
      progress: requiredSlotProgress(allRecords),
      canActivate: version ? canActivateVersion(version) : false,
    });
  }

  router.get('/workflow-mapping/:slug', renderMappingDetail);
  router.get('/workflow-mapping/:slug/v:version', renderMappingDetail);

  router.post('/workflow-mapping/import', async (req: Request, res: Response) => {
    const dataUrl = String(req.body.workflowJsonDataUrl ?? '');
    if (!dataUrl) throw new BadRequestError('A workflow JSON file is required');

    const filename = String(req.body.filename ?? 'workflow.json');
    const requestedSlotId = req.body.slotId ? String(req.body.slotId) : undefined;
    const targetSlotId = requestedSlotId || suggestSlotId(filename);

    if (!targetSlotId) {
      throw new BadRequestError(
        `Could not detect which workflow "${filename}" is — pick one from the "Workflow slot" dropdown`,
      );
    }

    let rawGraphJson: unknown;
    try {
      rawGraphJson = parseJsonDataUrl(dataUrl);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid JSON file');
    }

    try {
      const { record, version } = workflowMapping.importVersion(
        rawGraphJson,
        filename,
        targetSlotId,
      );

      // Every input just defaulted to a static value straight from the export — verify
      // those against a live /object_info snapshot now so anything ComfyUI doesn't
      // actually have installed (e.g. a renamed LoRA) is flagged immediately.
      try {
        const objectInfo = await getClient().getObjectInfo();
        const target = record.versions.find((v) => v.version === version);
        if (target) {
          const verifiedNodes = verifyStaticMappings(target.nodes, objectInfo);
          workflowMapping.replaceNodes(record.slotId, version, verifiedNodes);
        }
      } catch {
        // ComfyUI unreachable — leave everything as 'mapped'; re-verifies next time a
        // row is saved or the workflow is re-imported.
      }

      res.redirect(`/integration/workflow-mapping/${record.slug}/v${version}`);
    } catch (err) {
      if (err instanceof WorkflowSlotNotFoundError) throw new NotFoundError(err.message);
      throw new BadRequestError(err instanceof Error ? err.message : 'Could not import workflow');
    }
  });

  router.post(
    '/workflow-mapping/:slug/versions/:version/bind-phase',
    (req: Request, res: Response) => {
      const slug = param(req, 'slug');
      const slot = getWorkflowSlotBySlug(slug);
      if (!slot) throw new NotFoundError(`Unknown workflow "${slug}"`);

      const version = Number(param(req, 'version'));
      const targetSlotId = String(req.body.slotId ?? '').trim();

      if (!targetSlotId) throw new BadRequestError('A phase must be selected');
      if (targetSlotId !== slot.id) {
        // Reassigning an import to a different slot after the fact would require moving it
        // between records — instead, re-import the same file under the correct slot via
        // "Import new version" on that slot's page.
        throw new BadRequestError(
          `This import belongs to "${slot.id}" — to bind it to a different phase, re-import it from that slot's page`,
        );
      }

      workflowMapping.bindPhase(slot.id, version, targetSlotId);
      res.redirect(`/integration/workflow-mapping/${slug}/v${version}`);
    },
  );

  router.post(
    '/workflow-mapping/:slug/versions/:version/nodes/:nodeId/:inputName',
    async (req: Request, res: Response) => {
      const slug = param(req, 'slug');
      const slot = getWorkflowSlotBySlug(slug);
      if (!slot) throw new NotFoundError(`Unknown workflow "${slug}"`);

      const version = Number(param(req, 'version'));
      const nodeId = param(req, 'nodeId');
      const inputName = param(req, 'inputName');

      const sourceType = String(req.body.sourceType ?? 'unset');
      if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
        throw new BadRequestError('Invalid source type');
      }

      // The edit panel renders one visible field per possible source type (no client JS to
      // toggle which is shown) — the server picks whichever one matches the chosen type.
      const sourceValue =
        sourceType === 'unset' ? '' : String(req.body[`${sourceType}Value`] ?? '').trim();

      let status: NodeMapping['status'] = 'unmapped';
      if (sourceType !== 'unset' && sourceValue) {
        status = 'mapped';

        if (sourceType === 'static') {
          const record = workflowMapping.get(slot.id);
          const versionRecord = record?.versions.find((v) => v.version === version);
          const node = versionRecord?.nodes.find(
            (n) => n.nodeId === nodeId && n.inputName === inputName,
          );

          if (node) {
            try {
              const objectInfo = await getClient().getObjectInfo(node.classType);
              const choices = getObjectInfoChoices(objectInfo, node.classType, inputName);
              status = choices.length === 0 || choices.includes(sourceValue) ? 'verified' : 'missing';
            } catch {
              // ComfyUI unreachable right now — leave as 'mapped', can't verify
            }
          }
        }
      }

      workflowMapping.updateNodeMapping(slot.id, version, nodeId, inputName, {
        sourceType: sourceType as NodeMapping['sourceType'],
        sourceValue,
        status,
      });

      res.redirect(`/integration/workflow-mapping/${slug}/v${version}`);
    },
  );

  router.post(
    '/workflow-mapping/:slug/versions/:version/result-output',
    (req: Request, res: Response) => {
      const slug = param(req, 'slug');
      const slot = getWorkflowSlotBySlug(slug);
      if (!slot) throw new NotFoundError(`Unknown workflow "${slug}"`);

      const version = Number(param(req, 'version'));
      const nodeId = String(req.body.nodeId ?? '').trim();
      const outputIndex = Number(req.body.outputIndex ?? 0);
      const label = String(req.body.label ?? '').trim() || 'primary_result';

      if (!nodeId) throw new BadRequestError('A result node is required');

      workflowMapping.setResultOutput(slot.id, version, { nodeId, outputIndex, label });
      res.redirect(`/integration/workflow-mapping/${slug}/v${version}`);
    },
  );

  router.post(
    '/workflow-mapping/:slug/versions/:version/activate',
    (req: Request, res: Response) => {
      const slug = param(req, 'slug');
      const slot = getWorkflowSlotBySlug(slug);
      if (!slot) throw new NotFoundError(`Unknown workflow "${slug}"`);

      const version = Number(param(req, 'version'));

      const record = workflowMapping.get(slot.id);
      const target = record?.versions.find((v) => v.version === version);
      if (!target) throw new NotFoundError('Version not found');

      if (!canActivateVersion(target)) {
        throw new BadRequestError('Every input must be mapped and a result output set before activating');
      }

      workflowMapping.activateVersion(slot.id, version);
      res.redirect(`/integration/workflow-mapping/${slug}/v${version}`);
    },
  );

  router.post('/workflow-mapping/:slug/delete', (req: Request, res: Response) => {
    const slug = param(req, 'slug');
    const slot = getWorkflowSlotBySlug(slug);
    if (!slot) throw new NotFoundError(`Unknown workflow "${slug}"`);

    workflowMapping.deleteRecord(slot.id);
    res.redirect('/integration/workflow-mapping');
  });

  router.get('/models-loras', async (_req: Request, res: Response) => {
    let objectInfo: ObjectInfo = {};
    let syncError: string | undefined;

    try {
      objectInfo = await getClient().getObjectInfo();
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'Could not reach ComfyUI';
    }

    const records = workflowMapping.list();
    const staticMappings = records.flatMap((record) => {
      const version = activeVersion(record);
      if (!version) return [];
      return version.nodes
        .filter((node) => node.sourceType === 'static' && node.sourceValue)
        .map((node) => ({ slotId: record.slotId, classType: node.classType, filename: node.sourceValue }));
    });

    const groups = MODEL_GROUPS.map((group) => {
      const installed = new Map<string, string>();
      for (const entry of group.entries) {
        for (const filename of getObjectInfoChoices(objectInfo, entry.classType, entry.inputName)) {
          if (!installed.has(filename)) installed.set(filename, entry.classType);
        }
      }

      const relevantMappings = staticMappings.filter((m) =>
        group.entries.some((e) => e.classType === m.classType),
      );

      const rows = [
        ...Array.from(installed.entries()).map(([filename, loader]) => ({
          filename,
          loader,
          usedBy: relevantMappings.filter((m) => m.filename === filename).map((m) => m.slotId),
          installed: true,
        })),
        ...Array.from(new Set(relevantMappings.map((m) => m.filename)))
          .filter((filename) => !installed.has(filename))
          .map((filename) => ({
            filename,
            loader: group.entries[0]?.classType ?? '',
            usedBy: relevantMappings.filter((m) => m.filename === filename).map((m) => m.slotId),
            installed: false,
          })),
      ];

      return { title: group.title, rows };
    });

    res.render('integration/models-loras.njk', {
      section: 'integration',
      subsection: 'models-loras',
      groups,
      syncError,
      progress: requiredSlotProgress(records),
    });
  });

  return router;
}
