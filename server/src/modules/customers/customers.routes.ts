import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as customersController from "./customers.controller.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

/** Must be declared before `/:id`, or "tiers" is read as an id. */
customersRouter.get("/tiers", customersController.tiers);

customersRouter.get("/", customersController.list);
customersRouter.get("/:id", customersController.detail);

const canWrite = requireRole("ADMIN", "SALES_MANAGER", "SALES_REP");

customersRouter.post("/", canWrite, customersController.create);
customersRouter.patch("/:id", canWrite, customersController.update);

/**
 * Portal access. A customer cannot sign themselves up, so this is the only way
 * a `CUSTOMER` account comes into existence — the rep who owns the
 * relationship issues the invitation.
 */
customersRouter.get("/:id/portal-access", canWrite, customersController.portalAccess);
customersRouter.post("/:id/portal-invites", canWrite, customersController.invite);
customersRouter.delete(
  "/:id/portal-invites/:inviteId",
  canWrite,
  customersController.revokeInvite,
);
customersRouter.delete(
  "/:id/portal-access/:userId",
  canWrite,
  customersController.revokeAccess,
);
