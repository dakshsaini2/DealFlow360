import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as authService from "./auth.service.js";
import { loginSchema, signupSchema } from "./auth.types.js";

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
