import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  currentUser,
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as controller from "./portal.controller.js";
import { assertPortalAccess } from "./portal.service.js";

/**
 * A separate surface, not a relabelled internal one. Only `CUSTOMER` may enter,
 * and only for the accounts they are actually attached to — an internal role
 * has no route in here at all, so nothing about the customer view can drift
 * back into the seller's screens.
 */
export const portalRouter = Router();

portalRouter.use(requireAuth);
portalRouter.use(requireRole("CUSTOMER"));

/** A portal login with no linked account can see nothing, and is told so. */
portalRouter.use(async (req: Request, _res: Response, next: NextFunction) => {
  try {
    await assertPortalAccess(currentUser(req));
    next();
  } catch (err) {
    next(err);
  }
});

/* ── storefront: the customer browses and requests ── */

portalRouter.get("/accounts", controller.accounts);
portalRouter.get("/products", controller.browse);
portalRouter.get("/categories", controller.categories);
portalRouter.post("/requests", controller.submitRequest);

/* ── their orders ─────────────────────────────────── */

portalRouter.get("/orders", controller.orders);
portalRouter.get("/orders/:id", controller.orderDetail);

/* ── their quotations ─────────────────────────────── */

portalRouter.get("/quotations", controller.list);
portalRouter.get("/quotations/:id", controller.detail);
portalRouter.post("/quotations/:id/comments", controller.comment);
portalRouter.post("/quotations/:id/change-requests", controller.requestChange);
portalRouter.post("/quotations/:id/counter-offers", controller.counterOffer);
portalRouter.post("/quotations/:id/confirm", controller.confirm);
