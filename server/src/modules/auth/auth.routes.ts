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
/* ── email verification (public: the caller is proving an address) ── */

authRouter.post("/verify-email", authController.verifyEmail);
authRouter.post("/resend-verification", authController.resendVerification);

/* ── password reset ─────────────────────────────── */

authRouter.post("/forgot-password", authController.forgotPassword);
authRouter.get("/reset-password/:token", authController.checkResetToken);
authRouter.post("/reset-password", authController.resetPassword);

authRouter.get("/invites/:token", authController.describeInvite);
authRouter.post("/invites/:token/accept", authController.acceptInvite);
