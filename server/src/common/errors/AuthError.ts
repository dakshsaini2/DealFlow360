import { AppError } from "./AppError.js";

export class AuthError extends AppError {
  constructor(message: string, status = 401, code = "UNAUTHORIZED") {
    super(message, status, code);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }
}

export class MissingTokenError extends AuthError {
  constructor() {
    super("Missing bearer token", 401, "MISSING_TOKEN");
  }
}

export class InvalidTokenError extends AuthError {
  constructor() {
    super("Invalid or expired token", 401, "INVALID_TOKEN");
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class EmailAlreadyRegisteredError extends AuthError {
  constructor() {
    super("Email already registered", 409, "EMAIL_ALREADY_REGISTERED");
  }
}
