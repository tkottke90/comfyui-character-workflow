import { Application } from 'express';
import { Logger } from '@tkottke90/logger';

export function createLogger(app: Application) {
  app.logger = new Logger({ name: app.config.get('appName', 'comfyui-character') });
}
