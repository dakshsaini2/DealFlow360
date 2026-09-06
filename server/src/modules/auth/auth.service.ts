import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from "../../common/errors/AuthError.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import {
  DEFAULT_USER_ROLE,
  normalizeRoles,
  type UserRole,
} from "../../common/types/auth.types.js";
import {
  hashPassword,
  signToken,
  verifyPassword,
} from "../../common/utils/auth.js";
import { prisma } from "../../common/utils/prisma.js";
import { sendVerificationCode } from "./verification.service.js";
import type {
  AuthResult,
  LoginInput,
  PublicUser,
  SignupInput,
} from "./auth.types.js";

const WITH_ROLES = { userRoles: { include: { role: true } } } as const;

type UserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
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

  // The account exists either way; a mail failure must not undo a signup, so
  // this never throws.
  await sendVerificationCode({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
  });

  return toAuthResult(user);
}

export async function login({
  email,
  password,
}: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: WITH_ROLES,
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const matches = await verifyPassword(password, user.passwordHash);

  if (!matches) {
    throw new InvalidCredentialsError();
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

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
      roles: publicUser.roles,
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
    roles: toUserRoles(user.userRoles),
    // Drives the "confirm your email" prompt; a date would tell the client
    // nothing it needs.
    emailVerified: user.emailVerifiedAt !== null,
  };
}

/**
 * A user with no recognized role still needs one, otherwise every route guard
 * rejects them; the least-privileged default is used.
 */
function toUserRoles(userRoles: { role: { name: string } }[]): UserRole[] {
  const roles = normalizeRoles(userRoles.map((entry) => entry.role.name));

  return roles.length > 0 ? roles : [DEFAULT_USER_ROLE];
}
