import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const listPortalQuotationsSchema = z.object({
  status: z.string().trim().max(40).optional(),
});

export const lineCommentSchema = z.object({
  /** Omit for a comment on the whole quotation. */
  quoteLineId: z.uuid().optional(),
  comment: z.string().trim().min(1, "say something").max(2000),
});

export const changeRequestSchema = z.object({
  quoteLineId: z.uuid().optional(),
  requestType: z.enum(["QUANTITY", "REMOVE_LINE", "DISCOUNT", "DELIVERY", "OTHER"]),
  requestedQuantity: z.coerce.number().positive().max(1_000_000).optional(),
  message: z.string().trim().min(1, "describe the change").max(2000),
});

export const counterOfferSchema = z.object({
  discountPercent: z.coerce.number().min(0).max(100),
  message: z.string().trim().max(2000).optional(),
});

export const portalConfirmSchema = z.object({
  /** The customer's own note on accepting. */
  reason: z.string().trim().max(400).optional(),
});

export type ListPortalQuotationsQuery = z.infer<typeof listPortalQuotationsSchema>;
export type LineCommentInput = z.infer<typeof lineCommentSchema>;
export type ChangeRequestInput = z.infer<typeof changeRequestSchema>;
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
