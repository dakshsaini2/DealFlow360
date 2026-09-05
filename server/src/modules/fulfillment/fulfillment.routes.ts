import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as controller from "./fulfillment.controller.js";

/** Mounted at `/api/warehouses` — the stock picture behind a split. */
export const warehousesRouter = Router();

warehousesRouter.use(requireAuth);
warehousesRouter.get("/", controller.listWarehouses);

/**
 * Mounted at `/api/orders/:id/fulfillment`. The spec puts warehouse splits and
 * backorder decisions with Finance / Operations, so writes are theirs; a rep
 * can see where their own order is being sourced from.
 */
export const fulfillmentRouter = Router({ mergeParams: true });

const canFulfil = requireRole("ADMIN", "SALES_MANAGER", "FINANCE");

fulfillmentRouter.get("/", controller.detail);
fulfillmentRouter.post("/accept", canFulfil, controller.accept);
fulfillmentRouter.post("/override", canFulfil, controller.override);
fulfillmentRouter.post("/consolidate", canFulfil, controller.consolidate);
fulfillmentRouter.post("/ship", canFulfil, controller.ship);
