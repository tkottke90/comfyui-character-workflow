import {} from '@tkottke/hateos-url-manager';
import { Application } from '../types/application';
import { Router } from 'express';
import { version } from '../../package.json';
import { generateRandomSeed } from '../lib/random-seed';
import { createManualWorkflowAPI } from './v1/manual';

const v1 = Router();

v1.get('/healthcheck', (_, res) => {
  res.send({ status: 'OKAY' });
});

v1.get('/random-seed', (_, res) => {
  res.send({ seed: generateRandomSeed() });
});

v1.get('/', (_, res) => {
  res.send({
    version,
    links: {
      healthcheck: '/api/v1/healthcheck',
      randomSeed: '/api/v1/random-seed',
    },
  });
});


export function createAPI(app: Application) {
  v1.use('/manual', createManualWorkflowAPI(app))

  app.use('/api/v1', v1);
}
