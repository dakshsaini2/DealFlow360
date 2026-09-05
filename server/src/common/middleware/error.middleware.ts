import type { NextFunction, Request, Response } from "express";
import { AppError, NotFoundError } from "../errors/AppError.js";
import { isProduction } from "../utils/env.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    });
  }

  console.error("Unhandled error:", err);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      ...(isProduction || !(err instanceof Error)
        ? {}
        : { details: err.message }),
    },
  });
}
