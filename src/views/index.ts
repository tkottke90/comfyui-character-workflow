import path from 'node:path';
import nunjucks from 'nunjucks';
import express from 'express';
import { Application } from '../types/application';
import { createCharactersService } from '../services/characters.service';
import { createCharacterImagesService } from '../services/character-images.service';
import { createTemplatesService } from '../services/templates.service';
import { createWorkflowMappingService } from '../services/workflow-mapping.service';
import { createCharactersRouter } from './characters.views';
import { createTemplatesRouter } from './templates.views';
import { createIntegrationRouter } from './integration.views';

export function createViews(app: Application) {
  const templatesDir = path.join(process.cwd(), 'src', 'templates');
  nunjucks.configure(templatesDir, {
    autoescape: true,
    express: app,
    // Without this, nunjucks caches each compiled template forever — editing a .njk file
    // has no effect on a running process until it's restarted (unlike .ts changes, which
    // tsx watch picks up automatically since templates aren't part of its module graph).
    watch: true,
  });

  const charactersDir = app.config.getConfigDir('characters');
  const charactersService = createCharactersService(charactersDir);
  const characterImagesService = createCharacterImagesService(charactersDir);
  const templatesService = createTemplatesService(app.config.getConfigDir('templates'));
  const workflowMappingService = createWorkflowMappingService(app.config.getConfigDir('workflows'));

  app.use('/uploads/templates', express.static(templatesService.uploadsDir));

  app.get('/', (_req, res) => res.redirect('/characters'));
  app.use(
    '/characters',
    createCharactersRouter(app, charactersService, templatesService, characterImagesService),
  );
  app.use('/templates', createTemplatesRouter(templatesService, charactersService));
  app.use('/integration', createIntegrationRouter(app, workflowMappingService));
}
