import express from 'express';
import path from 'node:path';
import http from 'node:http';
import createConfig from './config';
import { createLogger } from './logger';
import { createViews } from './views';
import { createAPI } from './controllers';
import { createComfyInfrastructure } from './services/comfy-bootstrap';
import HttpEventMiddleware from './middleware/http.middleware';
import { errorHandler } from './middleware/error.middleware';
import { NotFoundError } from './errors/http.errors';
import { Application } from './types/application';

const SHUTDOWN_GRACE_PERIOD_MS = 5000;

export function App() {
  const app = express();
  let server: http.Server | undefined;

  // Setup modules
  createConfig(app);
  createLogger(app);

  // Request parsing / logging
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(HttpEventMiddleware);
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Shared ComfyUI client/socket/job-store — must exist before both the v1 API
  // controllers and the views are wired up, since both depend on them.
  createComfyInfrastructure(app);

  // Controllers
  createAPI(app);

  // Views
  createViews(app);

  // Unmatched routes fall through to a styled 404 instead of Express's default page
  app.use((req, _res) => {
    throw new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`);
  });

  // Error handling must be registered after routes
  app.use(errorHandler);

  // Functions
  app.start = (callback?: (app: Application) => void) => {
    const port = app.config.getNumber('port', 3000);
    server = app.listen(port, () => {
      app.logger.info(`Server listening on port ${port}`);

      if (callback) callback(app);
    });
  };
  app.shutdown = (code = 1) => {
    void (async () => {
      // Races draining the HTTP server against a fixed timeout — this app has long-lived
      // SSE connections (character phase pages, manual generation events) that
      // server.close()'s callback won't fire until they end, so without the timeout an
      // open tab would hang shutdown forever. Either way, cleanup below still runs and
      // process.exit() reclaims everything still open at the OS level regardless.
      await Promise.race([
        new Promise<void>((resolve) => {
          if (!server) {
            resolve();
            return;
          }
          server.close(() => resolve());
        }),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            app.logger.warn(
              `Shutdown: HTTP server did not drain within ${SHUTDOWN_GRACE_PERIOD_MS}ms ` +
                '(likely an open SSE connection) — forcing exit',
            );
            resolve();
          }, SHUTDOWN_GRACE_PERIOD_MS).unref();
        }),
      ]);

      app.comfySocket.close();
      await Promise.all([app.jobStore.close(), app.manualJobStore.close()]);

      process.exit(code);
    })();
  };

  process.on('SIGINT', () => app.shutdown(0));
  process.on('SIGTERM', () => app.shutdown(0));

  return app;
}
