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
