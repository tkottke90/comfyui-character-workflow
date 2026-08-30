import { Router, Request, Response } from 'express';
import path from 'node:path';
import { ManualWorkflowRegistry } from '@/services/manual-workflow.service';
import { Application } from '@/types/application';
import { BadRequestError } from '@/errors/http.errors';
import { readJsonFile, writeJsonFile } from '@/lib/files';
import { parseJsonDataUrl } from '@/lib/data-url';
import { createWorkflowMappingService } from '@/services/workflow-mapping.service';


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


  return manualRouter;
}


