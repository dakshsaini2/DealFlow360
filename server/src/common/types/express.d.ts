import type { AuthUser } from "./auth.types.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by the `requireAuth` middleware once a token has been verified. */
      user?: AuthUser;
    }
  }
}

export {};
