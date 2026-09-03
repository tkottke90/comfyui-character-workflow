import { Router, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { createWorkflowMappingService } from '../services/workflow-mapping.service';
import { getWorkflowSlot } from '../comfy/workflow-registry';
import { sanitizeSegment } from '@/lib/path-sanitize';
import { ConflictError, NotFoundError } from '@/errors/http.errors';
import type { ManualGeneration, ManualImage, ManualWorkflowSession } from '@/services/manual-workflow.service';
import { isJobActive } from '@/services/manual-execution.service';

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

    // Every generation not yet settled, independent of whether it belongs to a batch —
    // any number of jobs can be in flight for this session at once now, each tracked
    // through its own job-store slot. Each renders its own live tile matching
    // sse-client.js's `data-live-tile data-tile-key="..."` contract; once a generation
    // settles, the next page load naturally omits it here and shows it via
    // `doneGenerations` instead — no explicit hand-off needed.
    const liveGenerations: Array<ManualGeneration & { image?: ManualImage }> = sessionJson.generations
      .filter((g) => g.status === 'queued' || g.status === 'running')
      .map((g) => ({ ...g, image: g.imageId ? imagesById[g.imageId] : undefined }));

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
      doneGenerations,
      liveGenerations
    });
  });

  router.get('/:id/events', async (req: Request, res: Response) => {
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    // Any number of jobs (single generations and/or batches) can be in flight for this
    // session at once, each in its own job-store slot — so this stream is multiplexed:
    // every broadcast is a fresh snapshot of every currently-active job, plus whichever
    // job just changed (even into a settled state), so a job's final done/error
    // transition is always delivered at least once even though it then drops out of
    // future snapshots. Unlike the character pipeline's per-job SSE route, this
    // connection never closes on its own — new jobs can be submitted at any time the
    // page is open.
    const snapshot = (justChangedKey?: string) =>
      req.app.manualJobStore.listAll()
        .filter((entry) => entry.characterSlug === session.id)
        .filter((entry) => isJobActive(entry.record) || entry.phaseBindingKey === justChangedKey)
        .map((entry) => entry.record);

    const send = (justChangedKey?: string) => {
      res.write(`data: ${JSON.stringify({ jobs: snapshot(justChangedKey) })}\n\n`);
    };

    // Emit the current known state immediately on connect — a page reload opens a
    // brand-new connection and must see where things actually stand right now, not
    // only future transitions (see the character pipeline's identical SSE route).
    send();

    const unsubscribe = req.app.manualJobStore.onAnyChange(session.id, (key) => send(key));
    req.on('close', () => unsubscribe());
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
    const sessionJson = session.toJSON() as ManualWorkflowSession;
    const images = [...sessionJson.images].sort(SortImages);

    res.render('manual/workspace/images.njk', {
      session: sessionJson,
      images,
      error: typeof req.query.deleteError === 'string' ? req.query.deleteError : undefined
    });
  });

  router.post('/:id/workspace/images/:imageId/delete', async (req: Request, res: Response) => {
    try {
      await req.app.manualWorkflows.deleteImage(req.params.id.toString(), req.params.imageId.toString());
    } catch (err) {
      if (err instanceof ConflictError) {
        const message = encodeURIComponent(err.message);
        return res.redirect(`/manual/${req.params.id}/workspace/images?deleteError=${message}`);
      }
      throw err;
    }

    res.redirect(`/manual/${req.params.id}/workspace/images`);
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
    const sessionData = session.toJSON() as ManualWorkflowSession;
    const recentImages = [...sessionData.images].sort(SortImages).slice(0, 5);

    res.render('manual/detail.njk', {
      workflow: sessionData,
      recentImages
    });
  });
}

function SortImages(a: ManualImage, b: ManualImage) {
  return b.createdAt.getTime() - a.createdAt.getTime();
}