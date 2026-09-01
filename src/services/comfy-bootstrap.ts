import { Application } from '../types/application';
import { ComfyUiConfigSchema } from '../schemas/config.schema';
import { createComfyUIClient } from './comfyui-client.service';
import { createComfyUISocket } from './comfyui-socket.service';
import { createJobStore } from './job-store.service';

/**
 * Constructs the one shared ComfyUI client, persistent socket connection, and job store
 * for the app's whole lifetime, and attaches them to `app` — this needs to happen before
 * both `createAPI(app)` (the manual workflow API needs `app.jobStore`/`app.comfyClient` to
 * build its own execution service) and `createViews(app)` (the character execution engine
 * already depended on these, just constructed them locally instead of sharing them via `app`).
 */
export function createComfyInfrastructure(app: Application): void {
  const comfyConfig = app.config.loadConfig('comfy-ui', ComfyUiConfigSchema);

  app.comfyClient = createComfyUIClient({
    baseUrl: comfyConfig.baseUrl,
    apiKey: comfyConfig.apiKey || undefined,
  });

  app.comfySocket = createComfyUISocket({
    baseUrl: comfyConfig.baseUrl,
    apiKey: comfyConfig.apiKey || undefined,
    clientId: comfyConfig.clientId,
  });
  app.comfySocket.connect();

  app.jobStore = createJobStore(app.config.getConfigDir('jobs'));
  app.manualJobStore = createJobStore(app.config.getConfigDir('manual-jobs'));
}
