declare module 'nunjucks' {
  import { Application } from 'express';

  interface ConfigureOptions {
    autoescape?: boolean;
    express?: Application;
    watch?: boolean;
    noCache?: boolean;
  }

  export function configure(path: string, options?: ConfigureOptions): void;
}
