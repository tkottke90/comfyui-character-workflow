import path from 'node:path';
import nunjucks from 'nunjucks';
import express from 'express';
import { Application } from '../types/application';
import { ComfyUiConfigSchema, PhasePromptConfigSchema } from '../schemas/config.schema';
import { createCharactersService } from '../services/characters.service';
import { createCharacterImagesService } from '../services/character-images.service';
import { createTemplatesService } from '../services/templates.service';
import { createStylesService } from '../services/styles.service';
import { createWorkflowMappingService } from '../services/workflow-mapping.service';
import { createComfyUIClient } from '../services/comfyui-client.service';
import { createComfyUISocket } from '../services/comfyui-socket.service';
import { createJobStore } from '../services/job-store.service';
import { createExecutionService } from '../services/execution.service';
import { createCharactersRouter } from './characters.views';
import { createTemplatesRouter } from './templates.views';
import { createStylesRouter } from './styles.views';
import { createIntegrationRouter } from './integration.views';
import { createViewRouter } from '../lib/view-router';
import { createManualViewRouter } from './manual.views';

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
  const stylesService = createStylesService(app.config.getConfigDir('styles'));
  const workflowMappingService = createWorkflowMappingService(app.config.getConfigDir('workflows'));

  // Execution engine wiring — one shared ComfyUI client + one persistent socket
  // connection for the app's whole lifetime (not per-request, unlike the Integration
  // pages' own short-lived clients used only for read-only status/object_info calls).
  // The socket reconnects itself with capped backoff on an unexpected drop; reconnecting
  // it when the comfy-ui config changes at runtime is still out of scope — this just gets
  // a working connection up at boot.
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
  const phasePromptConfig = app.config.loadConfig('phase-prompt', PhasePromptConfigSchema);
  const executionService = createExecutionService({
    workflowMapping: workflowMappingService,
    characters: charactersService,
    characterImages: characterImagesService,
    templates: templatesService,
    comfyClient,
    socket: comfySocket,
    jobStore,
    clientId: comfyConfig.clientId,
    phasePromptConfig,
  });

  // Restart reconciliation: any job left queued/running belongs to a promptOwners entry
  // that died with the previous process — without this, the persistent socket would never
  // route future messages back to it again, leaving the UI stuck showing "running" forever.
  // Fire-and-forget: shouldn't block the server from accepting requests while it runs.
  executionService.reconcile().catch((err) => {
    app.logger.error('Startup job reconciliation failed', err instanceof Error ? err : undefined);
  });

  app.use('/uploads/templates', express.static(templatesService.uploadsDir));

  app.get('/', (_req, res) => res.redirect('/characters'));
  app.use(
    '/characters',
    createCharactersRouter(
      app,
      charactersService,
      templatesService,
      stylesService,
      characterImagesService,
      executionService,
      jobStore,
    ),
  );
  app.use('/templates', createTemplatesRouter(templatesService, charactersService));
  app.use('/styles', createStylesRouter(app, stylesService));
  app.use('/integration', createIntegrationRouter(app, workflowMappingService, comfySocket));
  createViewRouter('/manual', app, createManualViewRouter)
}
