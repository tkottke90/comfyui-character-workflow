import { Router, Request, Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { imageSize } from 'image-size';
import { ManualWorkflowRegistry, ManualFieldSchema, ImageSchema } from '@/services/manual-workflow.service';
import { Application } from '@/types/application';
import { BadRequestError, NotFoundError } from '@/errors/http.errors';
import { readJsonFile, writeJsonFile } from '@/lib/files';
import { parseJsonDataUrl, parseDataUrl } from '@/lib/data-url';
import { createWorkflowMappingService } from '@/services/workflow-mapping.service';

function defaultValueForType(type: string) {
  switch (type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'image': return null;
    case 'multiline': return '';
    default: return '';
  }
}


export function createManualWorkflowAPI(app: Application) {
  const manualRouter = Router()

  const dir = app.config.getConfigDir('manual');

  app.manualWorkflows = ManualWorkflowRegistry.fromPath(path.resolve(dir, 'registry.json'))

  const workflowMapping = createWorkflowMappingService(app.config.getConfigDir('workflows'));

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

    let updated;
    try {
      updated = ManualFieldSchema.parse({ ...existing, key: nextKey, type: nextType, value, updatedAt: new Date() });
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

    let buffer: Buffer, extension: string, width: number, height: number;
    try {
      ({ buffer, extension } = parseDataUrl(dataUrl));
      ({ width, height } = imageSize(buffer));
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid image file');
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;

    const assetsDir = path.join(session.workflowDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, filename), buffer);

    const image = ImageSchema.parse({ id, filename, size: { width, height } });
    await app.manualWorkflows.updateSession(session.id, { images: [...session.images, image] });

    res.status(201).json(image);
  });

  return manualRouter;
}


