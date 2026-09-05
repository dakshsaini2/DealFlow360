import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { parsePageParams } from "../../common/utils/pagination.js";
import { validate } from "../../common/utils/validate.js";
import * as invoices from "./invoices.service.js";
import * as subscriptions from "./subscriptions.service.js";
import {
  cancelSubscriptionSchema,
  changeQuantitySchema,
  idParamSchema,
  issueRecurringSchema,
  listInvoicesSchema,
  listSubscriptionsSchema,
  recordPaymentSchema,
  subscriptionLineParamsSchema,
} from "./billing.types.js";

/* ── subscriptions ────────────────────────────────── */

export async function listSubscriptions(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listSubscriptionsSchema, req.query);
    const page = parsePageParams(req.query);

    res.json(await subscriptions.listSubscriptions(currentUser(req), query, page));
  } catch (err) {
    next(err);
  }
}

export async function subscriptionDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await subscriptions.getSubscription(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

/** Mounted under `/api/orders/:id/subscription`. */
export async function subscriptionForOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const result = await subscriptions.getSubscriptionForOrder(currentUser(req), id);

    res.json(result ?? { subscription: null, recurringTotal: 0 });
  } catch (err) {
    next(err);
  }
}

export async function changeQuantity(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, lineId } = validate(subscriptionLineParamsSchema, req.params);
    const input = validate(changeQuantitySchema, req.body);

    res.json(await subscriptions.changeQuantity(currentUser(req), id, lineId, input));
  } catch (err) {
    next(err);
  }
}

/**
 * Cancelling and crediting are one action from the customer's point of view, so
 * the refund the subscription engine computes is turned into a credit note here
 * rather than leaving the caller to remember.
 */
export async function cancelSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(cancelSubscriptionSchema, req.body);
    const user = currentUser(req);

    const result = await subscriptions.cancelSubscription(user, id, input);
    const creditNote = await invoices.issueCancellationCredit(
      user,
      id,
      result.refundDue,
      `Subscription cancelled: ${input.reason}`,
    );

    res.json({ ...result, creditNote });
  } catch (err) {
    next(err);
  }
}

/* ── invoices ─────────────────────────────────────── */

export async function listInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listInvoicesSchema, req.query);
    const page = parsePageParams(req.query);

    res.json(await invoices.listInvoices(currentUser(req), query, page));
  } catch (err) {
    next(err);
  }
}

export async function invoiceDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await invoices.getInvoice(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function recordPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(recordPaymentSchema, req.body);

    res.status(201).json(await invoices.recordPayment(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function issueRecurring(req: Request, res: Response, next: NextFunction) {
  try {
    const input = validate(issueRecurringSchema, req.body ?? {});

    res.json(await invoices.issueRecurringInvoices(currentUser(req), input));
  } catch (err) {
    next(err);
  }
}
