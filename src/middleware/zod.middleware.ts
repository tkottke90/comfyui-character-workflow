/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZodObject, ZodRawShape, z, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../errors/http.errors';


export function ZodBodyValidator<T extends ZodRawShape>(schema: ZodObject<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      let message = 'Validation Failed';
      let details: any = {};

      if (err instanceof ZodError) {
        message = `Validation failed: ${err.issues.length} errors detected in body`;
        details = err.issues;
      }

      const badReqError = new BadRequestError(message);
      badReqError.details = details;

      next(badReqError);
    }
  };
}

export function ZodQueryValidator<T extends ZodRawShape>(schema: ZodObject<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      let message = 'Query Format Error';
      let details: any = {};

      if (err instanceof ZodError) {
        message = `Validation failed: ${err.issues.length} errors detected in query params`;
        details = err.issues;
      }

      const badReqError = new BadRequestError(message);
      badReqError.details = details;

      next(badReqError);
    }
  };
}

export function ZodParamValidator<T extends ZodRawShape>(schema: ZodObject<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      let message = 'Query Format Error';
      let details: any = {};

      if (err instanceof ZodError) {
        message = `Validation failed: ${err.issues.length} errors detected in url params`;
        details = err.issues;
      }

      const badReqError = new BadRequestError(message);
      badReqError.details = details;

      next(badReqError);
    }
  };
}

export function ZodIdValidator(idField = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req.params as any)[idField] = z
        .coerce
        .number()
        .parse(req.params[idField]) as any;
      next();
    } catch (err) {
      let message = 'Query Format Error';
      let details: any = {};

      if (err instanceof ZodError) {
        message = err.message;
        details = err.issues;
      }

      const badReqError = new BadRequestError(message);
      badReqError.details = details;

      next(badReqError);
    }
  };
}