import path from 'node:path';
import nunjucks from 'nunjucks';
import express from 'express';
import { Application } from '../types/application';
import { ComfyUiConfigSchema } from '../schemas/config.schema';
import { createCharactersService } from '../services/characters.service';
import { createCharacterImagesService } from '../services/character-images.service';
import { createTemplatesService } from '../services/templates.service';
import { createWorkflowMappingService } from '../services/workflow-mapping.service';
import { createComfyUIClient } from '../services/comfyui-client.service';
import { createComfyUISocket } from '../services/comfyui-socket.service';
import { createJobStore } from '../services/job-store.service';
import { createExecutionService } from '../services/execution.service';
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

  // Execution engine wiring — one shared ComfyUI client + one persistent socket
  // connection for the app's whole lifetime (not per-request, unlike the Integration
  // pages' own short-lived clients used only for read-only status/object_info calls).
  // Reconnecting this socket when the comfy-ui config changes at runtime, and the
  // retry/backoff policy for a dropped connection, are Phase 8's concern — this just
  // gets a working connection up at boot.
  const comfyConfig = app.config.loadConfig('comfy-ui', ComfyUiConfigSchema);
  const comfyClient = createComfyUIClient({
    baseUrl: comfyConfig.baseUrl,
    apiKey: comfyConfig.apiKey || undefined,
  });
  const comfySocket = createComfyUISocket({
    baseUrl: comfyConfig.baseUrl,
    apiKey: comfyConfig.apiKey || undefined,
    clientId: comfyConfig.clientId,
  });
  comfySocket.connect();

  const jobStore = createJobStore(app.config.getConfigDir('jobs'));
  const executionService = createExecutionService({
    workflowMapping: workflowMappingService,
    characters: charactersService,
    characterImages: characterImagesService,
    comfyClient,
    socket: comfySocket,
    jobStore,
    clientId: comfyConfig.clientId,
  });

  app.use('/uploads/templates', express.static(templatesService.uploadsDir));

  app.get('/', (_req, res) => res.redirect('/characters'));
  app.use(
    '/characters',
    createCharactersRouter(
      app,
      charactersService,
      templatesService,
      characterImagesService,
      executionService,
      jobStore,
    ),
  );
  app.use('/templates', createTemplatesRouter(templatesService, charactersService));
  app.use('/integration', createIntegrationRouter(app, workflowMappingService));
}
