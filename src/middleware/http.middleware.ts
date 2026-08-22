import express from 'express';

const NS_PER_SEC = 1e9;
const NS_TO_MS = 1e6;

export default function HttpEventMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const logger = req.app.logger; // Assuming you have a logger instance attached to your app

  const requestId = crypto.randomUUID();

  req.logger = logger.child({ location: 'http', requestId });

  res.setHeader('req', requestId);
  req.logger.log('info', `${req.method} ${req.originalUrl}`, { requestId });
  res.locals.requestId = requestId;

  const start = process.hrtime();

  res.on('close', () => {
    const diff = process.hrtime(start);
    const duration = (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;

    req.logger.log('info', `${req.method} ${req.originalUrl} [${duration} ms]`, {
      method: req.method,
      url: req.url,
      timingMS: duration,
      status: res.statusCode,
      requestId,
    });
  });

  // Assign the route log to the request
  // so that we can use it elsewhere in the execution of
  // this particular http request
  res.locals.requestId = requestId;

  next();
}
