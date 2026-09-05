/** Claims carried by every access token issued by this server. */
export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

/** The authenticated caller, as attached to `req.user` by `requireAuth`. */
export type AuthUser = JwtPayload;

export const USER_ROLES = ["user", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "user";

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
  );
}
