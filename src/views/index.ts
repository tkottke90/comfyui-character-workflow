import path from 'node:path';
import nunjucks from 'nunjucks';
import express from 'express';
import { Application } from '../types/application';
import { createCharactersService } from '../services/characters.service';
import { createTemplatesService } from '../services/templates.service';
import { createCharactersRouter } from './characters.views';
import { createTemplatesRouter } from './templates.views';

export function createViews(app: Application) {
  const templatesDir = path.join(process.cwd(), 'src', 'templates');
  nunjucks.configure(templatesDir, {
    autoescape: true,
    express: app,
  });

  const charactersService = createCharactersService(app.config.getConfigDir('characters'));
  const templatesService = createTemplatesService(app.config.getConfigDir('templates'));

  app.use('/uploads/templates', express.static(templatesService.uploadsDir));

  app.get('/', (_req, res) => res.redirect('/characters'));
  app.use('/characters', createCharactersRouter(charactersService, templatesService));
  app.use('/templates', createTemplatesRouter(templatesService, charactersService));
}
