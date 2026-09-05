import { z } from "zod";

export const salesReportSchema = z.object({
  /** `custom` uses `from`/`to`; every other value is a rolling window. */
  period: z.enum(["today", "week", "month", "quarter", "custom"]).default("month"),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  salesRepId: z.uuid().optional(),
  teamId: z.uuid().optional(),
  approvalStatus: z.string().trim().max(40).optional(),
  status: z.string().trim().max(40).optional(),
  categoryId: z.uuid().optional(),
  productId: z.uuid().optional(),
});

export type SalesReportQuery = z.infer<typeof salesReportSchema>;
