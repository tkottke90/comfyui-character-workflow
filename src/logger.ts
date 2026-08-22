import { Application } from 'express';
import { configureFromSchema, LoggerConfigSchema } from '@tkottke90/logger';
import path from 'node:path';

export function createLogger(app: Application) {
  const logConfig = LoggerConfigSchema.parse(app.config.get('logging'))

  if (logConfig.file?.log?.filename) {
    logConfig.file.log.filename = path.resolve(app.config.getConfigDir(), logConfig.file.log.filename)
  }

  if (logConfig.file?.error?.filename) {
    logConfig.file.error.filename = path.resolve(app.config.getConfigDir(), logConfig.file.error.filename)
  }

  app.logger = configureFromSchema(
    'comfyui-character',
    logConfig
  )
}
