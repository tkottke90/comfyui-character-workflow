import {} from '@tkottke/hateos-url-manager';
import { Application } from '../types/application';
import { Router } from 'express';


const v1 = Router();

v1.get('/healthcheck', (_, res) => {
  res.send({ status: 'OKAY' })
});

export function createAPI(app: Application) {

  app.use('/api/v1', v1);

}