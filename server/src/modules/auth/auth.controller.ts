import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as invites from "../customers/invites.service.js";
import * as authService from "./auth.service.js";
import {
  acceptInviteSchema,
  inviteTokenParamSchema,
  loginSchema,
  signupSchema,
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
