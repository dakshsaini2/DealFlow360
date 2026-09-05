import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import * as authController from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.get("/me", requireAuth, authController.me);
