import { Router, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { createWorkflowMappingService } from '../services/workflow-mapping.service';
import { getWorkflowSlot } from '../comfy/workflow-registry';
import { sanitizeSegment } from '@/lib/path-sanitize';
import { NotFoundError } from '@/errors/http.errors';
import type { ManualWorkflowSession } from '@/services/manual-workflow.service';

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
    const sessionJson = session.toJSON() as ManualWorkflowSession;
    const imagesById = Object.fromEntries(sessionJson.images.map((img) => [img.id, img]));

    const doneGenerations = sessionJson.generations.filter(
      (generation) => generation.status === 'done' && imagesById[generation.imageId ?? '']
    );

    // `ui.dynamicFieldForm()` is imported without `with context` (deliberately —
    // the macro is meant to be reusable by pages with a completely different
    // context shape), so its `imageValuePartial` hook can't reach ambient
    // `session`/`imagesById` template variables. Resolving the image URL here
    // and attaching it directly to the field keeps the partial (and the
    // macro) fully self-contained.
    const fields = sessionJson.fields.map((field) => {
      if (field.type !== 'image' || !field.value) return field;
      const image = imagesById[field.value as string];
      if (!image) return field;
      return { ...field, imageUrl: `/manual/${sessionJson.id}/assets/${image.filename}` };
    });

    res.render('manual/workspace/generation.njk', {
      session: sessionJson,
      fields,
      imagesById,
      doneGenerations
    });
  });

  router.get('/:id/assets/:filename', async (req: Request, res: Response, next: NextFunction) => {
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
    const filename = sanitizeSegment(req.params.filename.toString());

    res.sendFile(path.join(session.workflowDir, 'assets', filename), (err) => {
      if (err) next(new NotFoundError('Image not found'));
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