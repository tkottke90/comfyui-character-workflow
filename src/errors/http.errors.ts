import { BaseError } from '@tkottke90/js-errors';

export class HttpError extends BaseError {
  statusCode: number = 500;
  
  constructor(message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestError extends HttpError {
  statusCode = 400;
  details?: unknown;

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends HttpError {
  statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class InternalServerError extends HttpError {
  statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = 'InternalServerError';
  }
}