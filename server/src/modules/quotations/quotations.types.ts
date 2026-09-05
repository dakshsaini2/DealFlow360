import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const lineParamsSchema = z.object({
  id: z.uuid("must be a valid id"),
  lineId: z.uuid("must be a valid line id"),
});

export const listQuotationsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  customerId: z.uuid().optional(),
  salesRepId: z.uuid().optional(),
  status: z.string().trim().max(40).optional(),
  approvalStatus: z.string().trim().max(40).optional(),
  /** `mine` narrows to the caller's own deals regardless of role. */
  scope: z.enum(["all", "mine"]).default("all"),
  sort: z.enum(["recent", "created", "value"]).default("recent"),
});

export const createQuotationSchema = z.object({
  customerId: z.uuid(),
  currencyCode: z.string().trim().length(3).toUpperCase().default("USD"),
  validUntil: z.iso.datetime().optional(),
  /** Optional opening cart, so a quote can be built in one call. */
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        variantId: z.uuid().optional(),
        quantity: z.coerce.number().positive().max(1_000_000).default(1),
        discountPercent: z.coerce.number().min(0).max(100).default(0),
        description: z.string().trim().max(400).optional(),
      }),
    )
    .max(200)
    .optional(),
});

export const updateQuotationSchema = z
  .object({
    validUntil: z.iso.datetime().nullable().optional(),
    teamId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const addLineSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().optional(),
  quantity: z.coerce.number().positive().max(1_000_000).default(1),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  description: z.string().trim().max(400).optional(),
});

export const updateLineSchema = z
  .object({
    quantity: z.coerce.number().positive().max(1_000_000).optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    description: z.string().trim().max(400).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

/** Applied to every line at once — the order-level discount control. */
export const applyOrderDiscountSchema = z.object({
  discountPercent: z.coerce.number().min(0).max(100),
});

export const sendQuotationSchema = z.object({
  reason: z.string().trim().max(400).optional(),
});

export type ListQuotationsQuery = z.infer<typeof listQuotationsSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type AddLineInput = z.infer<typeof addLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
