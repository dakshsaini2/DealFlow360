import { z } from "zod";
import {
  PAYMENT_METHOD,
} from "../../common/constants/status.js";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const subscriptionLineParamsSchema = z.object({
  id: z.uuid("must be a valid id"),
  lineId: z.uuid("must be a valid line id"),
});

export const listSubscriptionsSchema = z.object({
  customerId: z.uuid().optional(),
  status: z.string().trim().max(40).optional(),
  scope: z.enum(["all", "mine"]).default("all"),
});

export const changeQuantitySchema = z.object({
  quantity: z.coerce.number().positive().max(1_000_000),
  /** Defaults to now; the proration is measured from this instant. */
  effectiveAt: z.iso.datetime().optional(),
  reason: z.string().trim().max(400).optional(),
});

export const cancelSubscriptionSchema = z.object({
  /** Omit to cancel every line on the subscription. */
  subscriptionLineId: z.uuid().optional(),
  /**
   * The contractual default: service runs to the end of the period already
   * paid for, so nothing is refunded. `false` cancels immediately and credits
   * the unused part.
   */
  atPeriodEnd: z.coerce.boolean().default(true),
  effectiveAt: z.iso.datetime().optional(),
  reason: z.string().trim().min(1, "a reason is required").max(400),
});

export const listInvoicesSchema = z.object({
  q: z.string().trim().max(120).optional(),
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  status: z.string().trim().max(40).optional(),
  invoiceType: z.enum(["ONE_TIME", "RECURRING"]).optional(),
  scope: z.enum(["all", "mine"]).default("all"),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(100_000_000),
  paymentMethod: z.enum([
    PAYMENT_METHOD.BANK_TRANSFER,
    PAYMENT_METHOD.CARD,
    PAYMENT_METHOD.CHEQUE,
    PAYMENT_METHOD.CREDIT_NOTE,
  ]),
  transactionReference: z.string().trim().max(120).optional(),
  paidAt: z.iso.datetime().optional(),
  reason: z.string().trim().max(400).optional(),
});

export const issueRecurringSchema = z.object({
  /** Bill everything due on or before this instant; defaults to now. */
  upTo: z.iso.datetime().optional(),
  /** Narrows the run to one subscription. */
  subscriptionId: z.uuid().optional(),
});

export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsSchema>;
export type ChangeQuantityInput = z.infer<typeof changeQuantitySchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type IssueRecurringInput = z.infer<typeof issueRecurringSchema>;
