import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as ordersController from "../orders/orders.controller.js";
import { recommendationsRouter } from "../recommendations/recommendations.routes.js";
import * as controller from "./quotations.controller.js";

export const quotationsRouter = Router();

quotationsRouter.use(requireAuth);

quotationsRouter.use("/:id/recommendations", recommendationsRouter);

quotationsRouter.get("/", controller.list);
quotationsRouter.get("/:id", controller.detail);
quotationsRouter.get("/:id/revisions", controller.revisions);

/** Only internal sales roles build quotations; portal users read them. */
const canWrite = requireRole("ADMIN", "SALES_MANAGER", "SALES_REP");

quotationsRouter.post("/", canWrite, controller.create);
quotationsRouter.patch("/:id", canWrite, controller.update);
quotationsRouter.post("/:id/lines", canWrite, controller.addLine);
quotationsRouter.patch("/:id/lines/:lineId", canWrite, controller.updateLine);
quotationsRouter.delete("/:id/lines/:lineId", canWrite, controller.removeLine);
quotationsRouter.post("/:id/discount", canWrite, controller.applyOrderDiscount);
quotationsRouter.post("/:id/send", canWrite, controller.send);

/**
 * Confirmation lives in the orders module — it is the quote-to-order handover,
 * and it is gated on approval having actually cleared.
 */
quotationsRouter.post("/:id/confirm", canWrite, ordersController.confirm);

/* ── negotiation: the seller's half of the customer portal thread ── */

quotationsRouter.get("/:id/negotiation", controller.negotiationThread);
quotationsRouter.post("/:id/negotiation/reply", canWrite, controller.reply);
quotationsRouter.post(
  "/:id/negotiation/change-requests/:entryId",
  canWrite,
  controller.resolveChangeRequest,
);
quotationsRouter.post(
  "/:id/negotiation/counter-offers/:entryId",
  canWrite,
  controller.resolveCounterOffer,
);
