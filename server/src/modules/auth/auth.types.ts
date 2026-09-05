import { z } from "zod";
import { USER_ROLES, type UserRole } from "../../common/types/auth.types.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("must be a valid email address");

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`);

const name = z
  .string()
  .trim()
  .min(1, "is required")
  .max(MAX_NAME_LENGTH, `must be at most ${MAX_NAME_LENGTH} characters`);

export const loginSchema = z.object({ email, password });

export const signupSchema = z.object({
  email,
  password,
  firstName: name,
  lastName: name,
  /**
   * Self-signup creates internal sales staff only. A portal customer cannot
   * sign themselves up: their account is created by accepting an invitation
   * from the rep who owns the relationship, because being able to type a
   * company's email address must not be enough to read that company's deals.
   */
  role: z.enum(["SALES_REP"]).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/** The user shape that is safe to send back to a client. */
export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
};

export type AuthResult = {
  token: string;
  user: PublicUser;
};

export const ASSIGNABLE_ROLES = USER_ROLES;

/* ── portal invitations ───────────────────────────── */

export const inviteTokenParamSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export const acceptInviteSchema = z.object({
  password,
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
