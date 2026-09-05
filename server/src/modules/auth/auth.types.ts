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
  /** Self-signup may only ask for a rep or customer seat. */
  role: z.enum(["SALES_REP", "CUSTOMER"]).optional(),
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
