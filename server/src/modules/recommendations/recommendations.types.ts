import { z } from "zod";

export const quotationParamSchema = z.object({
  id: z.uuid("must be a valid quotation id"),
});

export const productActionParamsSchema = z.object({
  id: z.uuid("must be a valid quotation id"),
  productId: z.uuid("must be a valid product id"),
});

export const acceptSchema = z.object({
  quantity: z.coerce.number().positive().max(1_000_000).default(1),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

export type AcceptInput = z.infer<typeof acceptSchema>;
