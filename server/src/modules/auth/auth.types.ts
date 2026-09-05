import { ValidationError } from "../../common/errors/AppError.js";
import type { UserRole } from "../../common/types/auth.types.js";

export type Credentials = {
  email: string;
  password: string;
};

export type SignupInput = Credentials & {
  role?: UserRole;
};

export type LoginInput = Credentials;

/** The user shape that is safe to send back to a client. */
export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type AuthResult = {
  token: string;
  user: PublicUser;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates and normalizes an untrusted request body.
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
