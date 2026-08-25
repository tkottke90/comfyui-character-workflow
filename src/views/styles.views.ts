import { Router, Request, Response } from 'express';
import { Application } from '../types/application';
import { ComfyUiConfigSchema } from '../schemas/config.schema';
import {
  createComfyUIClient,
  getObjectInfoChoices,
  ObjectInfo,
} from '../services/comfyui-client.service';
import { StylesService } from '../services/styles.service';
import { BadRequestError, NotFoundError } from '../errors/http.errors';

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

export function createStylesRouter(app: Application, styles: StylesService): Router {
  const router = Router();

  function getClient() {
    const cfg = app.config.loadConfig('comfy-ui', ComfyUiConfigSchema);
    return createComfyUIClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey || undefined });
  }

  async function loadChoices(): Promise<{
    checkpoints: string[];
    samplers: string[];
    schedulers: string[];
    syncError?: string;
  }> {
    let objectInfo: ObjectInfo = {};
    let syncError: string | undefined;

    try {
      objectInfo = await getClient().getObjectInfo();
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'Could not reach ComfyUI';
    }

    return {
      checkpoints: getObjectInfoChoices(objectInfo, 'CheckpointLoaderSimple', 'ckpt_name'),
      samplers: getObjectInfoChoices(objectInfo, 'KSampler', 'sampler_name'),
      schedulers: getObjectInfoChoices(objectInfo, 'KSampler', 'scheduler'),
      syncError,
    };
  }

  function readStyleInput(req: Request) {
    const name = String(req.body.name ?? '').trim();
    if (!name) throw new BadRequestError('A style name is required');

    return {
      name,
      description: String(req.body.description ?? ''),
      artStyle: String(req.body.artStyle ?? ''),
      checkpoint: String(req.body.checkpoint ?? ''),
      sampler: String(req.body.sampler ?? ''),
      scheduler: String(req.body.scheduler ?? ''),
      cfg: Number(req.body.cfg ?? 5),
      steps: Number(req.body.steps ?? 28),
    };
  }

  router.get('/', (_req: Request, res: Response) => {
    res.render('styles/library.njk', { styles: styles.list() });
  });

  router.get('/new', async (_req: Request, res: Response) => {
    res.render('styles/form.njk', { style: undefined, ...(await loadChoices()) });
  });

  router.post('/', (req: Request, res: Response) => {
    const record = styles.create(readStyleInput(req));
    res.redirect(`/styles/${record.slug}`);
  });

  router.get('/:slug', async (req: Request, res: Response) => {
    const slug = param(req, 'slug');
    const style = styles.get(slug);
    if (!style) throw new NotFoundError(`Style "${slug}" not found`);

    res.render('styles/form.njk', { style, ...(await loadChoices()) });
  });

  router.post('/:slug', (req: Request, res: Response) => {
    const slug = param(req, 'slug');
    const updated = styles.update(slug, readStyleInput(req));
    if (!updated) throw new NotFoundError(`Style "${slug}" not found`);

    res.redirect(`/styles/${updated.slug}`);
  });

  router.post('/:slug/delete', (req: Request, res: Response) => {
    styles.remove(param(req, 'slug'));
    res.redirect('/styles');
  });

  return router;
}
