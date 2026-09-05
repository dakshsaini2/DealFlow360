export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type AuthUser = JwtPayload;

export const USER_ROLES = ["user", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "user";

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
  );
}
