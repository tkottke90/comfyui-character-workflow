import { App } from './app';

App().start((app) => {
  const port = app.config.getNumber('port', 3000)
  const host = app.config.get('host', 'localhost')

  app.logger.info(`Application available at: http://${host}:${port}`)
});
