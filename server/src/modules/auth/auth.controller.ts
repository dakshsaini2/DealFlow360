import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as invites from "../customers/invites.service.js";
import * as verification from "./verification.service.js";
import * as authService from "./auth.service.js";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  inviteTokenParamSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  resetTokenParamSchema,
  signupSchema,
  verifyEmailSchema,
} from "./auth.types.js";

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = validate(signupSchema, req.body);
    res.status(201).json(await authService.signup(input));
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = validate(loginSchema, req.body);
    res.json(await authService.login(input));
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ user: await authService.getUserById(currentUser(req).sub) });
  } catch (err) {
    next(err);
  }
}

/* ── portal invitations (public) ──────────────────── */

/** Renders the acceptance screen: who was invited, and to which account. */
export async function describeInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = validate(inviteTokenParamSchema, req.params);

    res.json(await invites.describeInvite(token));
  } catch (err) {
    next(err);
  }
}

/**
 * Sets the password and signs the customer straight in, so the invite link
 * lands them on their quotations rather than back at a login form.
 */
export async function acceptInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = validate(inviteTokenParamSchema, req.params);
    const input = validate(acceptInviteSchema, req.body);

    res.status(201).json(await invites.acceptInvite(token, input));
  } catch (err) {
    next(err);
  }
}

/* ── email verification ───────────────────────────── */

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await verification.verifyEmail(validate(verifyEmailSchema, req.body)));
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(
      await verification.resendVerification(validate(resendVerificationSchema, req.body)),
    );
  } catch (err) {
    next(err);
  }
}

/* ── password reset ───────────────────────────────── */

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await verification.forgotPassword(validate(forgotPasswordSchema, req.body)));
  } catch (err) {
    next(err);
  }
}

/** Lets the reset form check its link before asking for a new password. */
export async function checkResetToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = validate(resetTokenParamSchema, req.params);

    res.json(await verification.checkResetToken(token));
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await verification.resetPassword(validate(resetPasswordSchema, req.body)));
  } catch (err) {
    next(err);
  }
}
