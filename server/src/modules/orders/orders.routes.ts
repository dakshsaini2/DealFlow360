import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import { orderSubscriptionRouter } from "../billing/billing.routes.js";
import { fulfillmentRouter } from "../fulfillment/fulfillment.routes.js";
import * as controller from "./orders.controller.js";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

/** Warehouse split, backorders and shipping for one order. */
ordersRouter.use("/:id/fulfillment", fulfillmentRouter);

/** The recurring half of a hybrid order, if it has one. */
ordersRouter.use("/:id/subscription", orderSubscriptionRouter);

ordersRouter.get("/", controller.list);
ordersRouter.get("/:id", controller.detail);

/** Cancelling a confirmed sale is a finance/management call, not a rep's. */
ordersRouter.post(
  "/:id/cancel",
  requireRole("ADMIN", "SALES_MANAGER", "FINANCE"),
  controller.cancel,
);
