import { HttpError } from '../errors/http.errors';
import { Request, Response } from 'express';

function respond(req: Request, res: Response, status: number, message: string) {
  if (req.accepts(['html', 'json']) === 'html') {
    res.status(status).render('error.njk', { status, message });
    return;
  }
  res.status(status).json({ error: message });
}

export function errorHandler(err: Error, req: Request, res: Response, _: unknown) {
  const { logger } = req;

  // When explicit http errors are thrown, we can use the details
  // to provide the correct context to the client
  if (err instanceof HttpError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.error(`HTTP error: ${err.message}`, { stack: err.stack, details: (err as any).details });
    respond(req, res, err.statusCode, err.message);
  } else {
    // Catch all other errors and return a generic 500 error to the client
    logger.error('Unhandled error:', err);
    respond(req, res, 500, 'Internal Server Error');
  }
}
