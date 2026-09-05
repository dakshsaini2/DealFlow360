import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const listOrdersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  customerId: z.uuid().optional(),
  status: z.string().trim().max(40).optional(),
  /** `mine` narrows to the caller's own orders regardless of role. */
  scope: z.enum(["all", "mine"]).default("all"),
  sort: z.enum(["recent", "created", "value"]).default("recent"),
});

export const confirmQuotationSchema = z.object({
  /**
   * What the customer is promised. Delivery slippage on the deal-health
   * dashboard is measured against this date, so it is worth capturing up front.
   */
  promisedDeliveryDate: z.iso.datetime().optional(),
  reason: z.string().trim().max(400).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1, "a reason is required").max(400),
});

export type ListOrdersQuery = z.infer<typeof listOrdersSchema>;
export type ConfirmQuotationInput = z.infer<typeof confirmQuotationSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
