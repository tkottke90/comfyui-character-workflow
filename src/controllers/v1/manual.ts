import { Router, Request, Response } from 'express';
import path from 'node:path';
import { ManualWorkflowRegistry } from '@/services/manual-workflow.service';
import { Application } from '@/types/application';
import { BadRequestError } from '@/errors/http.errors';


export function createManualWorkflowAPI(app: Application) {
  const manualRouter = Router()
  
  const dir = app.config.getConfigDir('manual');

  app.manualWorkflows = ManualWorkflowRegistry.fromPath(path.resolve(dir, 'registry.json'))
  
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

  });


  return manualRouter;
}


