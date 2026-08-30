import { Router, Request, Response } from 'express';

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
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

    res.render('manual/workspace/configuration.njk', {
      session: session.toJSON()
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