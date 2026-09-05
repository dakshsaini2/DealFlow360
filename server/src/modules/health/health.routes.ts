import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as controller from "./health.controller.js";

export const healthRouter = Router();

healthRouter.use(requireAuth);

/** A rep sees their own deals here; managers see the book. */
healthRouter.get("/dashboard", controller.dashboard);

/** Nudging and escalating are management actions (spec §3). */
healthRouter.post(
  "/alerts/:id/act",
  requireRole("ADMIN", "SALES_MANAGER", "FINANCE"),
  controller.actOnAlert,
);
