import { Router, Request, Response } from 'express';
import { createWorkflowMappingService } from '../services/workflow-mapping.service';
import { getWorkflowSlot } from '../comfy/workflow-registry';

export function createManualViewRouter(router: Router) {

  router.get('/', async (req: Request, res: Response) => {
    const sessions = await Promise.all(
      Array.from(req.app.manualWorkflows.sessions.keys())
        .map((id) => req.app.manualWorkflows.getSession(id))
    );

    res.render('manual/library.njk', {
      sessions: sessions.map((session) => session.toJSON())
    });
  });

  router.get('/new', async (req: Request, res: Response) => {
    res.render('manual/new.njk')
  });

  router.get('/:id/workspace', (req: Request, res: Response) => {
    res.redirect(`/manual/${req.params.id}/workspace/configuration`);
  });

  router.get('/:id/workspace/configuration', async (req: Request, res: Response) => {
    const workflowMapping = createWorkflowMappingService(req.app.config.getConfigDir('workflows'));
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

    const integrationOptions = workflowMapping
      .list()
      .filter((record) => record.versions.length > 0)
      .map((record) => {
        const version = record.versions.at(-1)!; // latest only, not full history
        const slot = getWorkflowSlot(record.slotId);
        return {
          value: `integration|${record.slotId}|${version.version}`,
          label: `${slot?.label ?? record.slotId} — v${version.version} (${version.filename})`,
        };
      });

    const otherSessionIds = Array.from(req.app.manualWorkflows.sessions.keys())
      .filter((id) => id !== session.id);
    const otherSessions = await Promise.all(
      otherSessionIds.map((id) => req.app.manualWorkflows.getSession(id))
    );
    const sessionOptions = otherSessions
      .filter((other) => other.workflowFile)
      .map((other) => ({
        value: `session|${other.id}`,
        label: `${other.workflowName} (${other.workflowFile})`,
      }));

    res.render('manual/workspace/configuration.njk', {
      session: session.toJSON(),
      integrationOptions,
      sessionOptions
    });
  });

  router.get('/:id/workspace/generation', async (req: Request, res: Response) => {
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

    res.render('manual/workspace/generation.njk', {
      session: session.toJSON()
    });
  });

  router.get('/:id/workspace/images', async (req: Request, res: Response) => {
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

    res.render('manual/workspace/images.njk', {
      session: session.toJSON()
    });
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

    res.render('manual/detail.njk', {
      workflow: session.toJSON()
    });
  });
}