import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, MissingTokenError } from "../errors/AuthError.js";
import type { UserRole } from "../types/auth.types.js";
import { extractBearerToken, verifyToken } from "../utils/auth.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return next(new MissingTokenError());
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new MissingTokenError());
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }

    next();
  };
}
