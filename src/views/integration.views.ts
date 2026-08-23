import { Router, Request, Response } from 'express';
import { Application } from '../types/application';
import { ComfyUiConfigSchema } from '../schemas/config.schema';
import {
  createComfyUIClient,
  getObjectInfoChoices,
  ObjectInfo,
} from '../services/comfyui-client.service';
import {
  WorkflowMappingService,
  WorkflowSlotNotFoundError,
} from '../services/workflow-mapping.service';
import { BadRequestError, NotFoundError } from '../errors/http.errors';
import { parseJsonDataUrl } from '../lib/data-url';
import {
  getWorkflowSlot,
  requiredWorkflowSlots,
  slugifySlotId,
  WORKFLOW_SLOTS,
} from '../comfy/workflow-registry';
import { DOMAIN_FIELDS } from '../comfy/domain-fields';
import {
  activeVersion,
  canActivateVersion,
  latestVersion,
  phaseBindingRows,
  requiredSlotProgress,
} from '../lib/workflow-mapping-logic';
import { NodeMapping, WorkflowMappingRecord } from '../schemas/workflow-mapping.schema';

const SOURCE_TYPES = ['unset', 'domain', 'computed', 'static'] as const;

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
    });
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

  router.get('/workflow-mapping', (_req: Request, res: Response) => {
    const records = workflowMapping.list();
    const progress = requiredSlotProgress(records);

    const withVersions = records.find((record) => record.versions.length > 0);
    if (withVersions) {
      return res.redirect(`/integration/workflow-mapping/${withVersions.slotId}`);
    }

    res.render('integration/workflow-mapping-empty.njk', {
      section: 'integration',
      subsection: 'workflow-mapping',
      progress,
      requiredSlots: requiredWorkflowSlots(),
      allSlots: WORKFLOW_SLOTS,
      phaseBindings: phaseBindingRows(records),
    });
  });

  router.get('/workflow-mapping/:slotId', async (req: Request, res: Response) => {
    const slotId = param(req, 'slotId');
    const slot = getWorkflowSlot(slotId);
    if (!slot) throw new NotFoundError(`Unknown workflow slot "${slotId}"`);

    const allRecords = workflowMapping.list();
    const record = workflowMapping.get(slotId) ?? emptyRecord(slotId);

    const requestedVersion = req.query.version ? Number(req.query.version) : undefined;
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
    if (editingKey && version) {
      const [nodeId, inputName] = editingKey.split(':');
      editingNode = version.nodes.find((n) => n.nodeId === nodeId && n.inputName === inputName);
      if (editingNode) {
        editingOptions = getObjectInfoChoices(objectInfo, editingNode.classType, editingNode.inputName);
      }
    }

    const uniqueNodeIds = version ? Array.from(new Set(version.nodes.map((n) => n.nodeId))) : [];

    res.render('integration/workflow-mapping-detail.njk', {
      section: 'integration',
      subsection: 'workflow-mapping',
      slot,
      record,
      version,
      uniqueNodeIds,
      editingKey,
      editingNode,
      editingOptions,
      comfyUnreachable,
      domainFields: DOMAIN_FIELDS,
      phaseBindings: phaseBindingRows(allRecords),
      allRecords,
      progress: requiredSlotProgress(allRecords),
      canActivate: version ? canActivateVersion(version, slot) : false,
    });
  });

  router.post('/workflow-mapping/import', (req: Request, res: Response) => {
    const dataUrl = String(req.body.workflowJsonDataUrl ?? '');
    if (!dataUrl) throw new BadRequestError('A workflow JSON file is required');

    const filename = String(req.body.filename ?? 'workflow.json');
    const requestedSlotId = req.body.slotId ? String(req.body.slotId) : undefined;

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
        requestedSlotId,
      );
      res.redirect(`/integration/workflow-mapping/${record.slotId}?version=${version}`);
    } catch (err) {
      if (err instanceof WorkflowSlotNotFoundError) throw new NotFoundError(err.message);
      throw new BadRequestError(err instanceof Error ? err.message : 'Could not import workflow');
    }
  });

  router.post(
    '/workflow-mapping/:slotId/versions/:version/bind-phase',
    (req: Request, res: Response) => {
      const slotId = param(req, 'slotId');
      const version = Number(param(req, 'version'));
      const targetSlotId = String(req.body.slotId ?? '').trim();

      if (!targetSlotId) throw new BadRequestError('A phase must be selected');
      if (targetSlotId !== slotId) {
        // Reassigning an import to a different slot after the fact would require moving it
        // between records — instead, re-import the same file under the correct slot via
        // "Import new version" on that slot's page.
        throw new BadRequestError(
          `This import belongs to "${slotId}" — to bind it to a different phase, re-import it from that slot's page`,
        );
      }

      workflowMapping.bindPhase(slotId, version, targetSlotId);
      res.redirect(`/integration/workflow-mapping/${slotId}?version=${version}`);
    },
  );

  router.post(
    '/workflow-mapping/:slotId/versions/:version/nodes/:nodeId/:inputName',
    async (req: Request, res: Response) => {
      const slotId = param(req, 'slotId');
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
          const record = workflowMapping.get(slotId);
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

      workflowMapping.updateNodeMapping(slotId, version, nodeId, inputName, {
        sourceType: sourceType as NodeMapping['sourceType'],
        sourceValue,
        status,
      });

      res.redirect(`/integration/workflow-mapping/${slotId}?version=${version}`);
    },
  );

  router.post(
    '/workflow-mapping/:slotId/versions/:version/result-output',
    (req: Request, res: Response) => {
      const slotId = param(req, 'slotId');
      const version = Number(param(req, 'version'));
      const nodeId = String(req.body.nodeId ?? '').trim();
      const outputIndex = Number(req.body.outputIndex ?? 0);
      const label = String(req.body.label ?? '').trim() || 'primary_result';

      if (!nodeId) throw new BadRequestError('A result node is required');

      workflowMapping.setResultOutput(slotId, version, { nodeId, outputIndex, label });
      res.redirect(`/integration/workflow-mapping/${slotId}?version=${version}`);
    },
  );

  router.post(
    '/workflow-mapping/:slotId/versions/:version/activate',
    (req: Request, res: Response) => {
      const slotId = param(req, 'slotId');
      const version = Number(param(req, 'version'));

      const slot = getWorkflowSlot(slotId);
      if (!slot) throw new NotFoundError(`Unknown workflow slot "${slotId}"`);

      const record = workflowMapping.get(slotId);
      const target = record?.versions.find((v) => v.version === version);
      if (!target) throw new NotFoundError('Version not found');

      if (!canActivateVersion(target, slot)) {
        throw new BadRequestError(
          'Every input must be mapped, a phase bound, and a result output set before activating',
        );
      }

      workflowMapping.activateVersion(slotId, version);
      res.redirect(`/integration/workflow-mapping/${slotId}?version=${version}`);
    },
  );

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
