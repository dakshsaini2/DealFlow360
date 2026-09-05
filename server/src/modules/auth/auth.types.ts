import { ValidationError } from "../../common/errors/AppError.js";
import type { UserRole } from "../../common/types/auth.types.js";

export type Credentials = {
  email: string;
  password: string;
};

export type SignupInput = Credentials & {
  firstName: string;
  lastName: string;
  role?: UserRole;
};

export type LoginInput = Credentials;

/** The user shape that is safe to send back to a client. */
export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
};

export type AuthResult = {
  token: string;
  user: PublicUser;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;

/**
 * Validates and normalizes an untrusted login body.
 * Throws `ValidationError` listing every problem found.
 */
export function parseCredentials(body: unknown): Credentials {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  const issues: string[] = [];

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    issues.push("email must be a valid email address");
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (issues.length > 0) {
    throw new ValidationError("Invalid credentials payload", issues);
  }

  return {
    email: (email as string).trim().toLowerCase(),
    password: password as string,
  };
}

/**
 * Validates and normalizes an untrusted signup body. `firstName` and
 * `lastName` are required columns on `User`, so they are collected here too.
 */
export function parseSignup(body: unknown): SignupInput {
  const credentials = parseCredentials(body);
  const { firstName, lastName } = (body ?? {}) as Record<string, unknown>;
  const issues: string[] = [];

  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";

  if (first.length === 0 || first.length > MAX_NAME_LENGTH) {
    issues.push(`firstName is required and must be at most ${MAX_NAME_LENGTH} characters`);
  }

  if (last.length === 0 || last.length > MAX_NAME_LENGTH) {
    issues.push(`lastName is required and must be at most ${MAX_NAME_LENGTH} characters`);
  }

  if (issues.length > 0) {
    throw new ValidationError("Invalid signup payload", issues);
  }

  return { ...credentials, firstName: first, lastName: last };
}
