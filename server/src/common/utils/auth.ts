import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { InvalidTokenError } from "../errors/AuthError.js";
import { isUserRole, type JwtPayload } from "../types/auth.types.js";
import { env } from "./env.js";

const BEARER_PREFIX = "Bearer ";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.saltRounds);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Verifies a token and returns its claims, or throws `InvalidTokenError`. */
export function verifyToken(token: string): JwtPayload {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new InvalidTokenError();
  }

  if (!isJwtPayload(decoded)) {
    throw new InvalidTokenError();
  }

  return decoded;
}

/** Pulls the raw token out of an `Authorization: Bearer <token>` header. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : null;
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const claims = value as Record<string, unknown>;

  return (
    typeof claims.sub === "string" &&
    typeof claims.email === "string" &&
    isUserRole(claims.role)
  );
}
