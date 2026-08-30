import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import nunjucks from 'nunjucks';
import { createManualWorkflowAPI } from '../../src/controllers/v1/manual';
import { createManualViewRouter } from '../../src/views/manual.views';
import { createViewRouter } from '../../src/lib/view-router';
import { errorHandler } from '../../src/middleware/error.middleware';
import { Application } from '../../src/types/application';
import { ManualWorkflowRegistry } from '../../src/services/manual-workflow.service';

export interface TestApp {
  baseUrl: string;
  manualWorkflows: ManualWorkflowRegistry;
  close(): Promise<void>;
}

/**
 * Boots a bare Express app mounting the real manual-workflow API and view
 * routers against a fresh temp-dir-backed config, so both can be exercised
 * over real HTTP. No supertest is installed in this repo, so tests hit
 * `baseUrl` with the platform's global `fetch`. Mirrors
 * `characters-test-app.ts`'s shape.
 */
export async function createTestApp(): Promise<TestApp> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-router-'));

  const app = express();
  nunjucks.configure(path.join(process.cwd(), 'src', 'templates'), {
    autoescape: true,
    express: app,
    watch: false,
  });

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use((req, _res, next) => {
    req.logger = {
      error() {},
      info() {},
      warn() {},
      log() {},
    } as unknown as Express.Request['logger'];
    next();
  });

  (app as unknown as Application).config = {
    getConfigDir(subPath: string = '') {
      const fullDir = path.resolve(root, subPath);
      if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
      return fullDir;
    },
  } as Application['config'];

  const typedApp = app as unknown as Application;

  app.use('/api/v1/manual', createManualWorkflowAPI(typedApp));
  createViewRouter('/manual', typedApp, createManualViewRouter);
  app.use(errorHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    manualWorkflows: typedApp.manualWorkflows,
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
