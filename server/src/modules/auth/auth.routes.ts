import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import * as authController from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.get("/me", requireAuth, authController.me);

/**
 * Accepting a portal invitation. Public by necessity — the invitee has no
 * account yet — but guarded by a 32-byte single-use token that expires.
 */
authRouter.get("/invites/:token", authController.describeInvite);
authRouter.post("/invites/:token/accept", authController.acceptInvite);
