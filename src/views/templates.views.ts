import { Router, Request, Response } from 'express';
import { TemplatesService } from '../services/templates.service';
import { CharactersService } from '../services/characters.service';
import { NotFoundError, BadRequestError } from '../errors/http.errors';
import { findCharactersUsingTemplate } from '../lib/template-logic';

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

export function createTemplatesRouter(
  templates: TemplatesService,
  characters: CharactersService,
): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const allCharacters = characters.list();
    const items = templates.list().map((template) => ({
      template,
      usageCount: findCharactersUsingTemplate(allCharacters, template.slug).length,
    }));
    res.render('templates/library.njk', { items });
  });

  router.get('/new', (_req: Request, res: Response) => {
    res.render('templates/upload.njk', {});
  });

  router.post('/', (req: Request, res: Response) => {
    const name = String(req.body.name ?? '').trim();
    if (!name) throw new BadRequestError('A template name is required');

    const type = req.body.type === 'openpose' ? 'openpose' : 'silhouette';
    const record = templates.create({
      name,
      type,
      notes: String(req.body.notes ?? ''),
      imageDataUrl: req.body.imageDataUrl || undefined,
    });
    res.redirect(`/templates/${record.slug}`);
  });

  router.get('/:slug', (req: Request, res: Response) => {
    const slug = param(req, 'slug');
    const template = templates.get(slug);
    if (!template) throw new NotFoundError(`Template "${slug}" not found`);

    const usedBy = findCharactersUsingTemplate(characters.list(), template.slug);
    res.render('templates/detail.njk', { template, usedBy });
  });

  router.post('/:slug/replace-image', (req: Request, res: Response) => {
    const slug = param(req, 'slug');
    const imageDataUrl = String(req.body.imageDataUrl ?? '');
    if (!imageDataUrl) throw new BadRequestError('An image is required');

    const updated = templates.replaceImage(slug, imageDataUrl);
    if (!updated) throw new NotFoundError(`Template "${slug}" not found`);
    res.redirect(`/templates/${slug}`);
  });

  router.post('/:slug/notes', (req: Request, res: Response) => {
    const slug = param(req, 'slug');
    const updated = templates.update(slug, { notes: String(req.body.notes ?? '') });
    if (!updated) throw new NotFoundError(`Template "${slug}" not found`);
    res.redirect(`/templates/${slug}`);
  });

  router.post('/:slug/delete', (req: Request, res: Response) => {
    templates.remove(param(req, 'slug'));
    res.redirect('/templates');
  });

  return router;
}
