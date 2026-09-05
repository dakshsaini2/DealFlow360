import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from "../../common/errors/AuthError.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import {
  DEFAULT_USER_ROLE,
  isUserRole,
  type UserRole,
} from "../../common/types/auth.types.js";
import {
  hashPassword,
  signToken,
  verifyPassword,
} from "../../common/utils/auth.js";
import { prisma } from "../../common/utils/prisma.js";
import type { AuthResult, LoginInput, PublicUser, SignupInput } from "./auth.types.js";

/** Roles live in their own table, joined to the user through `UserRole`. */
const WITH_ROLES = { userRoles: { include: { role: true } } } as const;

type UserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  userRoles: { role: { name: string } }[];
};

export async function signup({
  email,
  password,
  firstName,
  lastName,
  role = DEFAULT_USER_ROLE,
}: SignupInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName,
      lastName,
      userRoles: {
        create: {
          role: {
            connectOrCreate: { where: { name: role }, create: { name: role } },
          },
        },
      },
    },
    include: WITH_ROLES,
  });

  return toAuthResult(user);
}

export async function login({ email, password }: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: WITH_ROLES,
  });

  // Hash a throwaway password when the user is unknown so that both branches
  // cost roughly the same and cannot be told apart by timing.
  const matches = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, DUMMY_HASH);

  if (!user || !matches) {
    throw new InvalidCredentialsError();
  }

  return toAuthResult(user);
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: WITH_ROLES,
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return toPublicUser(user);
}

function toAuthResult(user: UserRecord): AuthResult {
  const publicUser = toPublicUser(user);

  return {
    token: signToken({
      sub: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
    }),
    user: publicUser,
  };
}

function toPublicUser(user: Omit<UserRecord, "passwordHash">): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: toUserRole(user.userRoles),
  };
}

/** Picks the first recognised role name; unknown or missing roles fall back. */
function toUserRole(userRoles: { role: { name: string } }[]): UserRole {
  return (
    userRoles.map((entry) => entry.role.name).find(isUserRole) ??
    DEFAULT_USER_ROLE
  );
}

/** Bcrypt hash of a value no user can log in with; used to equalize timing. */
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.aVjO9tQdJ0dEbnMBd1G9YQ8Qz4Zu";
