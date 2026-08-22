import express from 'express';
import path from 'node:path';
import createConfig from './config';
import { createLogger } from './logger';
import { createViews } from './views';
import { createAPI } from './controllers';
import HttpEventMiddleware from './middleware/http.middleware';
import { errorHandler } from './middleware/error.middleware';
import { NotFoundError } from './errors/http.errors';

export function App() {
  const app = express();

  // Setup modules
  createConfig(app);
  createLogger(app);

  // Request parsing / logging
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(HttpEventMiddleware);
  app.use(express.static(path.join(process.cwd(), 'public')));

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
  app.start = () => {
    const port = app.config.getNumber('port', 3000);
    app.listen(port, () => {
      app.logger.info(`Server listening on port ${port}`);
    });
  };
  app.shutdown = (code = 1) => {
    process.exit(code);
  };

  return app;
}
