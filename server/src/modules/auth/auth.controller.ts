import type { NextFunction, Request, Response } from "express";
import { MissingTokenError } from "../../common/errors/AuthError.js";
import * as authService from "./auth.service.js";
import { parseCredentials } from "./auth.types.js";

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const credentials = parseCredentials(req.body);
    res.status(201).json(await authService.signup(credentials));
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const credentials = parseCredentials(req.body);
    res.json(await authService.login(credentials));
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new MissingTokenError();
    }

    res.json({ user: await authService.getUserById(req.user.sub) });
  } catch (err) {
    next(err);
  }
}
