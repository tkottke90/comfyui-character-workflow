import { Router, Request, Response } from 'express';
import path from 'node:path';
import { z } from 'zod';
import {
  ManualWorkflowRegistry,
  ManualFieldSchema,
  ManualFieldMappingSchema
} from '@/services/manual-workflow.service';
import type { ManualFieldMapping, ManualWorkflowSession } from '@/services/manual-workflow.service';
import { Application } from '@/types/application';
import { BadRequestError, NotFoundError } from '@/errors/http.errors';
import { readJsonFile, writeJsonFile } from '@/lib/files';
import { parseJsonDataUrl, parseDataUrl } from '@/lib/data-url';
import { parseWorkflowGraph } from '@/lib/comfyui-workflow';
import { candidateOutputNodes } from '@/lib/workflow-mapping-logic';
import { storeManualImage } from '@/lib/manual-image-store';
import { createWorkflowMappingService } from '@/services/workflow-mapping.service';
import { createManualExecutionService } from '@/services/manual-execution.service';
import { ComfyUiConfigSchema } from '@/schemas/config.schema';

function defaultValueForType(type: string) {
  switch (type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'image': return null;
    case 'multiline': return '';
    default: return '';
  }
}

/**
 * Finds the first other mapping owner (a field, or the session's Seed) whose mappings
 * already claim one of `candidateMappings`' (nodeId, inputName) pairs. `ownerKey` is the
 * id of the field being edited, or the literal 'seed' when editing Seed's own mappings —
 * used to exclude the thing being edited from the conflict check against itself.
 */
function findMappingConflict(
  session: ManualWorkflowSession,
  ownerKey: string,
  candidateMappings: ManualFieldMapping[]
): { key: string } | undefined {
  const claimed = new Set(candidateMappings.map((m) => `${m.nodeId}:${m.inputName}`));

  if (ownerKey !== 'seed' && session.seedMappings.some((m) => claimed.has(`${m.nodeId}:${m.inputName}`))) {
    return { key: 'Seed' };
  }
  for (const field of session.fields) {
    if (field.id === ownerKey) continue;
    if (field.mappings.some((m) => claimed.has(`${m.nodeId}:${m.inputName}`))) {
      return { key: field.key };
    }
  }
  return undefined;
}


export function createManualWorkflowAPI(app: Application) {
  const manualRouter = Router()

  const dir = app.config.getConfigDir('manual');

  app.manualWorkflows = ManualWorkflowRegistry.fromPath(path.resolve(dir, 'registry.json'))

  const workflowMapping = createWorkflowMappingService(app.config.getConfigDir('workflows'));

  const comfyConfig = app.config.loadConfig('comfy-ui', ComfyUiConfigSchema);
  app.manualExecutionService = createManualExecutionService({
    manualWorkflows: app.manualWorkflows,
    comfyClient: app.comfyClient,
    socket: app.comfySocket,
    jobStore: app.manualJobStore,
    clientId: comfyConfig.clientId
  });
  app.manualExecutionService.reconcile().catch((err) => {
    app.logger.error(
      'Startup manual-job reconciliation failed',
      err instanceof Error ? err : undefined
    );
  });

  /**
   * Get Sessions
   */
  manualRouter.get('/', async (req: Request, res: Response) => {
    res.json({
      ...app.manualWorkflows.toJSON(),
      links: {
        self: req.path
      } 
    });
  });
  
  /**
   * Create a new Session
   */
  manualRouter.post('/', async (req: Request, res: Response) => {
    const { name } = req.body;

    if (!name) throw new BadRequestError('Invalid request - $.name is required in the JSON Body')

    const session = await app.manualWorkflows.addSession(name);

    const responseBody = {
      ...session.toJSON(),
      links: session.generateLinks(`/api/v1/manual`)
    }

    if (req.query.view) {
      res.redirect(responseBody.links.view);
    } else {
      res.status(201).json(responseBody)
    }
  })
  
  /**
   * Get a Session
   */
  manualRouter.get('/:id',async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString())

    res.status(201).json({
      ...session.toJSON(),
      links: session.generateLinks(`/api/v1/manual`)
    })
  })

  manualRouter.delete('/:id',async (req: Request, res: Response) => {
    await app.manualWorkflows.deleteSession(req.params.id.toString())

    res.status(204).end()
  })

  /**
   * Set the session ComfyUI Workflow
   */
  manualRouter.post('/:id/set-workflow', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const mode = String(req.body.mode ?? '');

    let rawGraphJson: unknown;

    if (mode === 'upload') {
      const dataUrl = String(req.body.workflowJsonDataUrl ?? '');
      if (!dataUrl) throw new BadRequestError('A workflow JSON file is required');
      try {
        rawGraphJson = parseJsonDataUrl(dataUrl);
      } catch (err) {
        throw new BadRequestError(err instanceof Error ? err.message : 'Invalid JSON file');
      }
    } else if (mode === 'select') {
      const [kind, ...rest] = String(req.body.source ?? '').split('|');

      if (kind === 'integration') {
        const [slotId, versionStr] = rest;
        const raw = workflowMapping.getRawGraph(slotId, Number(versionStr));
        if (!raw) throw new BadRequestError('Selected workflow could not be found');
        rawGraphJson = raw;
      } else if (kind === 'session') {
        const [sourceId] = rest;
        const source = await app.manualWorkflows.getSession(sourceId);
        if (!source.workflowFile) throw new BadRequestError('Selected session has no workflow file');
        rawGraphJson = await readJsonFile(path.join(source.workflowDir, source.workflowFile));
      } else {
        throw new BadRequestError('A workflow source must be selected');
      }
    } else {
      throw new BadRequestError('A workflow file or selection is required');
    }

    const workflowSource = mode === 'upload' ? 'upload' : 'select';

    await writeJsonFile(path.join(session.workflowDir, 'workflow.json'), rawGraphJson);
    await app.manualWorkflows.updateSession(session.id, { workflowFile: 'workflow.json', workflowSource });

    if (req.query.view) {
      res.redirect(`/manual/${session.id}/workspace/configuration`);
    } else {
      res.status(200).json({ ...session.toJSON(), workflowFile: 'workflow.json', workflowSource });
    }
  });

  /**
   * Add a field to the session's Generation-page input form
   */
  manualRouter.post('/:id/fields', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const key = String(req.body.key ?? '');
    const type = String(req.body.type ?? 'text');

    if (session.fields.some((f) => f.key === key)) {
      throw new BadRequestError(`A field with key "${key}" already exists`);
    }

    let field;
    try {
      field = ManualFieldSchema.parse({ key, type, value: defaultValueForType(type) });
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid field');
    }

    await app.manualWorkflows.updateSession(session.id, { fields: [...session.fields, field] });

    res.status(201).json(field);
  });

  /**
   * Update a field (rename key, change type/value)
   */
  manualRouter.patch('/:id/fields/:fieldId', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const existing = session.fields.find((f) => f.id === req.params.fieldId);
    if (!existing) throw new NotFoundError('Field not found');

    const nextKey = req.body.key !== undefined ? String(req.body.key) : existing.key;
    const nextType = req.body.type !== undefined ? String(req.body.type) : existing.type;

    if (nextKey !== existing.key && session.fields.some((f) => f.id !== existing.id && f.key === nextKey)) {
      throw new BadRequestError(`A field with key "${nextKey}" already exists`);
    }

    const value = nextType !== existing.type
      ? defaultValueForType(nextType)
      : (req.body.value !== undefined ? req.body.value : existing.value);

    let mappings = existing.mappings;
    if (req.body.mappings !== undefined) {
      let nextMappings;
      try {
        nextMappings = z.array(ManualFieldMappingSchema).parse(req.body.mappings);
      } catch (err) {
        throw new BadRequestError(err instanceof Error ? err.message : 'Invalid mappings');
      }

      const conflict = findMappingConflict(session, existing.id, nextMappings);
      if (conflict) {
        throw new BadRequestError(`Input already mapped to "${conflict.key}"`);
      }

      mappings = nextMappings;
    }

    let updated;
    try {
      updated = ManualFieldSchema.parse({
        ...existing,
        key: nextKey,
        type: nextType,
        value,
        mappings,
        updatedAt: new Date()
      });
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid field');
    }

    const fields = session.fields.map((f) => (f.id === existing.id ? updated : f));
    await app.manualWorkflows.updateSession(session.id, { fields });

    res.status(200).json(updated);
  });

  /**
   * Move a field up or down by swapping it with its adjacent sibling
   */
  manualRouter.post('/:id/fields/:fieldId/move', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const direction = String(req.body.direction ?? '');
    if (direction !== 'up' && direction !== 'down') {
      throw new BadRequestError('direction must be "up" or "down"');
    }

    const index = session.fields.findIndex((f) => f.id === req.params.fieldId);
    if (index === -1) throw new NotFoundError('Field not found');

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= session.fields.length) {
      res.status(200).json({ moved: false });
      return;
    }

    const fields = [...session.fields];
    [fields[index], fields[swapIndex]] = [fields[swapIndex], fields[index]];
    await app.manualWorkflows.updateSession(session.id, { fields });

    res.status(200).json({ moved: true });
  });

  /**
   * Delete a field
   */
  manualRouter.delete('/:id/fields/:fieldId', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const fields = session.fields.filter((f) => f.id !== req.params.fieldId);
    if (fields.length === session.fields.length) throw new NotFoundError('Field not found');

    await app.manualWorkflows.updateSession(session.id, { fields });
    res.status(204).end();
  });

  /**
   * Upload an image for use as an image-type field's value
   */
  manualRouter.post('/:id/images', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const dataUrl = String(req.body.imageDataUrl ?? '');
    if (!dataUrl) throw new BadRequestError('An image file is required');

    let image;
    try {
      const { buffer, extension } = parseDataUrl(dataUrl);
      image = await storeManualImage(
        app.manualWorkflows,
        session.id,
        session.workflowDir,
        buffer,
        extension
      );
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid image file');
    }

    res.status(201).json(image);
  });

  /**
   * Discover every mappable widget input in the session's attached workflow — fetched
   * once by the Configuration page's field-mapping picker, not rendered as a standing
   * list (see the field-mapping-execution design spec's departure from the
   * character-integration convention).
   */
  manualRouter.get('/:id/workflow-inputs', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    if (!session.workflowFile) {
      res.json({ inputs: [] });
      return;
    }

    const rawGraph = await readJsonFile(path.join(session.workflowDir, session.workflowFile));
    res.json({ inputs: parseWorkflowGraph(rawGraph) });
  });

  /**
   * Set which node/output produces the final result image for a generation.
   */
  manualRouter.post('/:id/result-output', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    const nodeId = String(req.body.nodeId ?? '').trim();
    if (!nodeId) throw new BadRequestError('A result node is required');
    const outputIndex = Number(req.body.outputIndex ?? 0);

    await app.manualWorkflows.updateSession(session.id, { resultOutput: { nodeId, outputIndex } });

    if (req.query.view) {
      res.redirect(`/manual/${session.id}/workspace/configuration`);
    } else {
      res.status(200).json({ nodeId, outputIndex });
    }
  });

  /**
   * Set which node inputs Seed is mapped to — a first-class, always-present pinned
   * mapping (not tied to any user-created field), mirroring the fields PATCH's own
   * mapping-save branch, including the same cross-mapping conflict check.
   */
  manualRouter.patch('/:id/seed-mapping', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());

    let nextMappings;
    try {
      nextMappings = z.array(ManualFieldMappingSchema).parse(req.body.mappings ?? []);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid mappings');
    }

    const conflict = findMappingConflict(session, 'seed', nextMappings);
    if (conflict) {
      throw new BadRequestError(`Input already mapped to "${conflict.key}"`);
    }

    await app.manualWorkflows.updateSession(session.id, { seedMappings: nextMappings });

    if (req.query.view) {
      res.redirect(`/manual/${session.id}/workspace/configuration`);
    } else {
      res.status(200).json({ mappings: nextMappings });
    }
  });

  /**
   * Candidate result-output nodes (SaveImage/PreviewImage-style) plus every node id in
   * the attached workflow — fetched once by the Result Output picker, the same
   * lazy-fetch-once-cached pattern the field/Seed picker already uses for workflow-inputs.
   */
  manualRouter.get('/:id/output-nodes', async (req: Request, res: Response) => {
    const session = await app.manualWorkflows.getSession(req.params.id.toString());
    if (!session.workflowFile) {
      res.json({ candidates: [], allNodeIds: [] });
      return;
    }

    const rawGraph = await readJsonFile(path.join(session.workflowDir, session.workflowFile));
    const parsedInputs = parseWorkflowGraph(rawGraph);
    res.json({
      candidates: candidateOutputNodes(parsedInputs),
      allNodeIds: Array.from(new Set(parsedInputs.map((input) => input.nodeId)))
    });
  });

  /**
   * Submit a single generation using the session's current field values and the given seed.
   */
  manualRouter.post('/:id/generate', async (req: Request, res: Response) => {
    const seed = Number(req.body.seed);
    if (!Number.isFinite(seed)) throw new BadRequestError('A seed is required');

    const { generationId } = await app.manualExecutionService.submitGeneration(
      req.params.id.toString(),
      seed
    );

    if (req.query.view) {
      res.redirect(`/manual/${req.params.id}/workspace/generation`);
    } else {
      res.status(202).json({ generationId });
    }
  });

  /**
   * Submit a batch of generations, auto-incrementing the seed by 1 per run, starting
   * from `start` (clamped to 1-16 runs, same bound as Casting Batch).
   */
  manualRouter.post('/:id/generate-batch', async (req: Request, res: Response) => {
    const start = Number(req.body.start);
    const count = Math.min(Math.max(Number(req.body.count) || 1, 1), 16);
    if (!Number.isFinite(start)) throw new BadRequestError('A start value is required');

    const { batchId } = await app.manualExecutionService.submitBatch(
      req.params.id.toString(),
      start,
      count
    );

    if (req.query.view) {
      res.redirect(`/manual/${req.params.id}/workspace/generation`);
    } else {
      res.status(202).json({ batchId });
    }
  });

  return manualRouter;
}


