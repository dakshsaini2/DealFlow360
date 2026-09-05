import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/** Route params arrive as strings; this rejects a malformed id with a 400. */
export const idParamSchema = z.object({ id: z.uuid("must be a valid id") });

export const listCustomersSchema = z.object({
  /** Free-text match against name, customer code and email. */
  q: z.string().trim().max(120).optional(),
  tierId: z.uuid().optional(),
  /** Defaults to active-only; pass `all` to include archived accounts. */
  status: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["recent", "name", "created"]).default("recent"),
});

export const createCustomerSchema = z.object({
  name: trimmed(200).min(1, "is required"),
  /** Left out, a sequential CUST-### code is generated. */
  customerCode: trimmed(40).optional(),
  email: z.string().trim().toLowerCase().email("must be a valid email address").optional(),
  phone: optionalText(40),
  billingAddress: optionalText(400),
  shippingAddress: optionalText(400),
  customerTierId: z.uuid().optional(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export type IdParam = z.infer<typeof idParamSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/* ── portal invitations ───────────────────────────── */

export const inviteParamsSchema = z.object({
  id: z.uuid("must be a valid id"),
  inviteId: z.uuid("must be a valid id"),
});

export const accessParamsSchema = z.object({
  id: z.uuid("must be a valid id"),
  userId: z.uuid("must be a valid id"),
});

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("must be a valid email"),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
