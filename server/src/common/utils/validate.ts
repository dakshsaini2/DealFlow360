import type { ZodType } from "zod";
import { ValidationError } from "../errors/AppError.js";

/**
 * Runs an untrusted body/query through a Zod schema and turns a failure into
 * the app's `ValidationError`, so `errorHandler` shapes it like every other
 * error. `details` is a flat list of "field: message" strings, which is what
 * the client already renders.
 */
export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map((issue) => {
    const path = issue.path.join(".");

    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return raise(details);
}

function raise(details: string[]): never {
  throw new ValidationError("Invalid request payload", details);
}
