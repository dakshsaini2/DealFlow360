import { z } from "zod";
import { SETTING_DEFAULTS } from "../../common/utils/settings.js";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

/* ── warehouses & stock (spec A4) ─────────────────── */

export const createWarehouseSchema = z.object({
  code: z.string().trim().min(2).max(20).toUpperCase(),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(400).optional(),
  /**
   * Multiplies the base shipment cost. The split engine uses it to break ties,
   * so a depot that is expensive to ship from loses to a cheaper one that can
   * cover the same order.
   */
  shippingCostWeight: z.coerce.number().min(0.1).max(10).default(1),
});

export const updateWarehouseSchema = createWarehouseSchema
  .partial()
  .extend({ isActive: z.coerce.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const setStockSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().optional(),
  onHandQuantity: z.coerce.number().min(0).max(1_000_000),
  reorderLevel: z.coerce.number().min(0).max(1_000_000).optional(),
  reorderQuantity: z.coerce.number().min(0).max(1_000_000).optional(),
});

/* ── subscription plans (spec A5) ─────────────────── */

export const createPlanSchema = z.object({
  name: z.string().trim().min(2).max(60),
  billingInterval: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]),
  intervalCount: z.coerce.number().int().min(1).max(36).default(1),
  price: z.coerce.number().min(0).max(1_000_000).default(0),
  currencyCode: z.string().trim().length(3).toUpperCase().default("USD"),
  /** Off means a mid-cycle change takes effect with no adjustment. */
  prorationEnabled: z.coerce.boolean().default(true),
  cancellationPolicy: z.string().trim().max(400).optional(),
  refundPolicy: z.string().trim().max(400).optional(),
});

export const updatePlanSchema = createPlanSchema
  .partial()
  .extend({ isActive: z.coerce.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const planProductsSchema = z.object({
  /** The products that may be sold on this plan. Replaces the whole set. */
  productIds: z.array(z.uuid()).max(200),
});

/* ── discount governance (spec A3) ────────────────── */

export const createTierSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(400).optional(),
  /** The tier-wide ceiling used when no category rule is more specific. */
  defaultDiscountCeiling: z.coerce.number().min(0).max(100),
});

export const updateTierSchema = createTierSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const upsertDiscountRuleSchema = z.object({
  customerTierId: z.uuid(),
  /** Omit for a rule that applies to every category in the tier. */
  categoryId: z.uuid().nullable().optional(),
  maxDiscountPercent: z.coerce.number().min(0).max(100),
  /** Higher wins when two rules could both apply. */
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.coerce.boolean().default(true),
});

/* ── thresholds (spec A7) ─────────────────────────── */

export const updateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.enum(
          Object.keys(SETTING_DEFAULTS) as [
            keyof typeof SETTING_DEFAULTS,
            ...(keyof typeof SETTING_DEFAULTS)[],
          ],
        ),
        value: z.string().trim().min(1).max(60),
      }),
    )
    .min(1)
    .max(20),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type SetStockInput = z.infer<typeof setStockSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type PlanProductsInput = z.infer<typeof planProductsSchema>;
export type CreateTierInput = z.infer<typeof createTierSchema>;
export type UpdateTierInput = z.infer<typeof updateTierSchema>;
export type UpsertDiscountRuleInput = z.infer<typeof upsertDiscountRuleSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
