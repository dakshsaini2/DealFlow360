import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const healthQuerySchema = z.object({
  scope: z.enum(["all", "mine"]).default("all"),
  alertType: z
    .enum(["STALLED", "DISCOUNT_ANOMALY", "DELIVERY_SLIPPAGE", "MARGIN_EROSION"])
    .optional(),
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).optional(),
});

export const actOnAlertSchema = z.object({
  /**
   * `NUDGE` posts a note to the rep, `ESCALATE` does the same and marks it as
   * management's, `DISMISS` closes it without a message.
   */
  action: z.enum(["NUDGE", "ESCALATE", "DISMISS"]),
  note: z.string().trim().max(1000).optional(),
});

export type HealthQuery = z.infer<typeof healthQuerySchema>;
export type ActOnAlertInput = z.infer<typeof actOnAlertSchema>;
