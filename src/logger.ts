import { Application } from 'express';
import { configureFromSchema } from '@tkottke90/logger';
import path from 'node:path';

export function createLogger(app: Application) {
  const logDir = app.config.getConfigDir('log')
  
  app.logger = configureFromSchema(
    'comfyui-character',
    {
      level: 'info',
      console: { enabled: true },
      file: {
        log: { filename: path.resolve(logDir, 'app.jsonl') },
        error: { filename: path.resolve(logDir, 'error.jsonl') }
      }
    }
  )
}
