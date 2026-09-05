import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as controller from "./approvals.controller.js";

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth);

/** The approver queue. Only the roles that can appear in a chain. */
approvalsRouter.get(
  "/",
  requireRole("ADMIN", "SALES_MANAGER", "FINANCE"),
  controller.queue,
);

approvalsRouter.get("/:id", controller.detail);

approvalsRouter.post(
  "/:id/act",
  requireRole("ADMIN", "SALES_MANAGER", "FINANCE"),
  controller.act,
);
