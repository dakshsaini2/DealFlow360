import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as controller from "./billing.controller.js";

/** Reconciling recurring billing and credit notes is Finance's job (spec §3). */
const canBill = requireRole("ADMIN", "SALES_MANAGER", "FINANCE");

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth);

subscriptionsRouter.get("/", controller.listSubscriptions);
subscriptionsRouter.get("/:id", controller.subscriptionDetail);
subscriptionsRouter.patch("/:id/lines/:lineId", canBill, controller.changeQuantity);
subscriptionsRouter.post("/:id/cancel", canBill, controller.cancelSubscription);

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

invoicesRouter.get("/", controller.listInvoices);
/** The recurring billing run — issues every period that has come due. */
invoicesRouter.post("/run-recurring", canBill, controller.issueRecurring);
invoicesRouter.get("/:id", controller.invoiceDetail);
invoicesRouter.post("/:id/payments", canBill, controller.recordPayment);

/** Mounted at `/api/orders/:id/subscription`. */
export const orderSubscriptionRouter = Router({ mergeParams: true });

orderSubscriptionRouter.use(requireAuth);
orderSubscriptionRouter.get("/", controller.subscriptionForOrder);
