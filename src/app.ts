import express from 'express';
import createConfig from './config';
import { createLogger } from './logger';
import { createViews } from './views';
import { createAPI } from './controllers';

export function App() {
  const app = express();

  // Setup modules
  createConfig(app);
  createLogger(app);
  
  // Controllers
  createAPI(app);
  
  // Views
  createViews(app);

  // Functions
  app.start = () => {}
  app.shutdown = (code?: number) => {}

  return app;
}
