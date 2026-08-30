import { Router } from 'express';
import { Application } from '../types/application';

type RoutePath = Parameters<Application['use']>[0]

export function createViewRouter(path: RoutePath, app: Application, callback: (router: Router) => void) {
  const router = Router();

  callback(router);

  app.use(path, router);
}