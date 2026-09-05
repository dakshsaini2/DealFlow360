import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const overrideSchema = z.object({
  /** Every warehouse-to-line assignment the operator wants. */
  allocations: z
    .array(
      z.object({
        orderLineId: z.uuid(),
        warehouseId: z.uuid(),
        quantity: z.coerce.number().positive().max(1_000_000),
      }),
    )
    .min(1, "at least one allocation is required")
    .max(200),
  reason: z.string().trim().max(400).optional(),
});

export const shipSchema = z.object({
  actualShippingCost: z.coerce.number().min(0).max(1_000_000).optional(),
  reason: z.string().trim().max(400).optional(),
});

export const listWarehousesSchema = z.object({
  /** Narrows the stock rows to the products on one order. */
  orderId: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
});

export type OverrideInput = z.infer<typeof overrideSchema>;
export type ShipInput = z.infer<typeof shipSchema>;
export type ListWarehousesQuery = z.infer<typeof listWarehousesSchema>;
