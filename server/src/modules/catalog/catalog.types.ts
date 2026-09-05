import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const listProductsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.uuid().optional(),
  productType: z.enum(["GOODS", "SERVICE"]).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["name", "priceAsc", "priceDesc", "recent"]).default("name"),
  /** Only products that can be sold on a recurring plan. */
  recurringOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const quantity = z.coerce
  .number()
  .positive("must be greater than zero")
  .max(1_000_000);

const percent = z.coerce.number().min(0).max(100);

export const resolvePriceSchema = z
  .object({
    /** Either a customer (their tier is looked up) or a tier directly. */
    customerId: z.uuid().optional(),
    customerTierId: z.uuid().optional(),
    currencyCode: z.string().trim().length(3).toUpperCase().default("USD"),
    lines: z
      .array(
        z.object({
          productId: z.uuid(),
          variantId: z.uuid().optional(),
          quantity: quantity.default(1),
          /** When supplied, the line is costed and checked against its ceiling. */
          discountPercent: percent.default(0),
        }),
      )
      .min(1, "at least one line is required")
      .max(200),
  })
  .refine((value) => value.customerId || value.customerTierId, {
    message: "customerId or customerTierId is required",
    path: ["customerId"],
  });

export type ListProductsQuery = z.infer<typeof listProductsSchema>;
export type ResolvePriceInput = z.infer<typeof resolvePriceSchema>;
export type ResolvePriceLine = ResolvePriceInput["lines"][number];
