import {} from '@tkottke/hateos-url-manager';
import { Application } from '../types/application';
import { Router } from 'express';
import { version } from '../../package.json';

const v1 = Router();

v1.get('/healthcheck', (_, res) => {
  res.send({ status: 'OKAY' });
});

v1.get('/', (_, res) => {
  res.send({
    version,
    links: {
      healthcheck: '/api/v1/healthcheck',
    },
  });
});

export function createAPI(app: Application) {
  app.use('/api/v1', v1);
}
