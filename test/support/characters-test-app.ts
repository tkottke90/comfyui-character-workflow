import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import nunjucks from 'nunjucks';
import { createCharactersRouter } from '../../src/views/characters.views';
import { createCharactersService, CharactersService } from '../../src/services/characters.service';
import { createCharacterImagesService } from '../../src/services/character-images.service';
import { createTemplatesService } from '../../src/services/templates.service';
import { createStylesService } from '../../src/services/styles.service';
import { errorHandler } from '../../src/middleware/error.middleware';
import { Application } from '../../src/types/application';
import { ExecutionService } from '../../src/services/execution.service';
import { JobStore } from '../../src/services/job-store.service';

export interface TestApp {
  baseUrl: string;
  charactersService: CharactersService;
  close(): Promise<void>;
}

/**
 * Boots a bare Express app mounting the real characters router against fresh
 * temp-dir-backed services, so the four JSON-response route branches can be
 * exercised over real HTTP. No supertest is installed in this repo, so tests
 * hit `baseUrl` with the platform's global `fetch`. executionService/jobStore
 * are stand-ins — none of the routes under test call either.
 */
export async function createTestApp(): Promise<TestApp> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'characters-router-'));

  const charactersService = createCharactersService(path.join(root, 'characters'));
  const characterImagesService = createCharacterImagesService(path.join(root, 'characters'));
  const templatesService = createTemplatesService(path.join(root, 'templates'));
  const stylesService = createStylesService(path.join(root, 'styles'));

  const app = express();
  nunjucks.configure(path.join(process.cwd(), 'src', 'templates'), {
    autoescape: true,
    express: app,
    watch: false,
  });

  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    // Stand-in for HttpEventMiddleware/createLogger, neither of which this bare
    // harness wires up — errorHandler (mounted below) reads req.logger.error().
    req.logger = {
      error() {},
      info() {},
      warn() {},
      log() {},
    } as unknown as Express.Request['logger'];
    next();
  });

  app.use(
    '/characters',
    createCharactersRouter(
      app as unknown as Application,
      charactersService,
      templatesService,
      stylesService,
      characterImagesService,
      {} as unknown as ExecutionService,
      { get: () => undefined } as unknown as JobStore,
    ),
  );
  app.use(errorHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    charactersService,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          fs.rmSync(root, { recursive: true, force: true });
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
