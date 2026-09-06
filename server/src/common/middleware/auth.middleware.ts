import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, MissingTokenError } from "../errors/AuthError.js";
import { hasAnyRole, type UserRole } from "../types/auth.types.js";
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

/** Passes when the caller holds at least one of `roles`. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new MissingTokenError());
    }

    if (!hasAnyRole(req.user, roles)) {
      // Phrased for the person who hit it, not the developer who wrote the
      // route — this reaches the UI verbatim.
      return next(
        new ForbiddenError(
          `Your role does not allow this. It needs ${describeRoles(roles)}.`,
        ),
      );
    }

    next();
  };
}

/** "a sales manager", or "a sales rep, sales manager or admin". */
function describeRoles(roles: readonly UserRole[]): string {
  const readable = roles.map((role) => role.replace(/_/g, " ").toLowerCase());

  if (readable.length === 1) {
    return `the ${readable[0]} role`;
  }

  const last = readable[readable.length - 1];

  return `the ${readable.slice(0, -1).join(", ")} or ${last} role`;
}

/**
 * Reads the authenticated user off the request. Only call this behind
 * `requireAuth` — it throws rather than returning `undefined` so callers do
 * not have to narrow on every use.
 */
export function currentUser(req: Request) {
  if (!req.user) {
    throw new MissingTokenError();
  }

  return req.user;
}
