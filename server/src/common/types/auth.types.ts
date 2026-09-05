/**
 * The four application roles. These strings are also what `ApprovalStep.role`
 * stores, so an approval policy can name an approver group directly.
 */
export const USER_ROLES = [
  "ADMIN",
  "SALES_MANAGER",
  "SALES_REP",
  "CUSTOMER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** New signups are sales reps; elevated roles are granted by an admin. */
export const DEFAULT_USER_ROLE = "SALES_REP" as const satisfies UserRole;

export type JwtPayload = {
  sub: string;
  email: string;
  /** Every role the user holds — a manager is usually a rep as well. */
  roles: UserRole[];
};

export type AuthUser = JwtPayload;

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/** Keeps only the recognized roles, de-duplicated and in `USER_ROLES` order. */
export function normalizeRoles(values: readonly unknown[]): UserRole[] {
  return USER_ROLES.filter((role) => values.includes(role));
}

export function hasAnyRole(
  user: Pick<AuthUser, "roles">,
  roles: readonly UserRole[],
): boolean {
  return user.roles.some((role) => roles.includes(role));
}
