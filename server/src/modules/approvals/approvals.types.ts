import { z } from "zod";
import { APPROVAL_ACTION } from "../../common/constants/status.js";

export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const actSchema = z.object({
  action: z.enum([
    APPROVAL_ACTION.APPROVE,
    APPROVAL_ACTION.REJECT,
    APPROVAL_ACTION.RETURN,
  ]),
  comment: z.string().trim().max(1000).optional(),
  /** Required for anything other than a plain approval — the spec wants a reason. */
  reason: z.string().trim().max(1000).optional(),
}).refine(
  (value) => value.action === APPROVAL_ACTION.APPROVE || Boolean(value.reason),
  { message: "a reason is required to reject or return a quotation", path: ["reason"] },
);

export const listQueueSchema = z.object({
  /** `mine` shows only steps this user can actually act on. */
  scope: z.enum(["mine", "all"]).default("mine"),
});

export type ActInput = z.infer<typeof actSchema>;
export type ListQueueQuery = z.infer<typeof listQueueSchema>;
