import path from 'node:path';
import nunjucks from 'nunjucks';
import express from 'express';
import { Application } from '../types/application';
import { createCharactersService } from '../services/characters.service';
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
  });

  const charactersService = createCharactersService(app.config.getConfigDir('characters'));
  const templatesService = createTemplatesService(app.config.getConfigDir('templates'));
  const workflowMappingService = createWorkflowMappingService(app.config.getConfigDir('workflows'));

  app.use('/uploads/templates', express.static(templatesService.uploadsDir));

  app.get('/', (_req, res) => res.redirect('/characters'));
  app.use('/characters', createCharactersRouter(charactersService, templatesService));
  app.use('/templates', createTemplatesRouter(templatesService, charactersService));
  app.use('/integration', createIntegrationRouter(app, workflowMappingService));
}
