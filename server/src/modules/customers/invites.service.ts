import { createHash, randomBytes } from "node:crypto";
import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { AUDIT_ACTION } from "../../common/constants/status.js";
import { DEFAULT_USER_ROLE, type AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import { hashPassword, signToken } from "../../common/utils/auth.js";
import { prisma } from "../../common/utils/prisma.js";
import { serialize } from "../../common/utils/serialize.js";
import type { AcceptInviteInput } from "../auth/auth.types.js";
import type { CreateInviteInput } from "./customers.types.js";

/**
 * Customer portal invitations.
 *
 * A customer's quotations are commercially sensitive, so portal access is
 * granted by the seller rather than claimed by the buyer — knowing a company's
 * email address must not be enough to read that company's deals. This module is
 * the only path by which a `CUSTOMER` user comes to exist.
 */

/** How long an unaccepted invitation stays usable. */
const INVITE_TTL_DAYS = 14;

/**
 * Only the SHA-256 of a token is stored, so a leaked database cannot be used to
 * accept invitations. The plaintext exists solely in the URL handed to the rep.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Who can already see this account's portal, and who has been asked. */
export async function getPortalAccess(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });

  if (!customer) {
    throw new NotFoundError("Customer not found");
  }

  const [members, invites] = await Promise.all([
    prisma.customerUser.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        isPrimary: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
      },
    }),
    prisma.portalInvite.findMany({
      where: { customerId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const now = Date.now();

  return {
    customer: serialize(customer),
    members: serialize(members),
    // An expired invite is shown as such rather than hidden, so a rep can see
    // why the customer never got in and re-send.
    invites: invites.map((invite) => ({
      ...serialize(invite),
      isExpired: invite.expiresAt.getTime() < now,
    })),
  };
}

/**
 * Creates an invitation and returns the one-time link.
 *
 * The token is returned exactly once, here. There is no way to read it back
 * afterwards — if the rep loses it, they revoke and re-invite.
 */
export async function createInvite(
  user: AuthUser,
  customerId: string,
  input: CreateInviteInput,
) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, isActive: true },
  });

  if (!customer) {
    throw new NotFoundError("Customer not found");
  }

  if (!customer.isActive) {
    throw new ValidationError("Cannot invite a contact for an archived customer", [
      "customerId: customer is archived",
    ]);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      customerUsers: { where: { customerId }, select: { id: true } },
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });

  if (existingUser && existingUser.customerUsers.length > 0) {
    throw new ValidationError("That contact already has access to this account", [
      "email: already linked",
    ]);
  }

  // An internal user must not also hold a portal seat: the portal deliberately
  // hides margin and risk, and a rep with both would simply use the internal
  // screens anyway.
  if (existingUser && !existingUser.userRoles.some((entry) => entry.role.name === "CUSTOMER")) {
    throw new ValidationError(
      "That email belongs to an internal user and cannot be given portal access",
      ["email: internal account"],
    );
  }

  const pending = await prisma.portalInvite.findFirst({
    where: { customerId, email: input.email, acceptedAt: null, revokedAt: null },
    select: { id: true },
  });

  if (pending) {
    throw new ValidationError(
      "An invitation is already outstanding for that address — revoke it first to issue a new link",
      ["email: invitation pending"],
    );
  }

  const token = randomBytes(32).toString("base64url");

  const invite = await prisma.portalInvite.create({
    data: {
      customerId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      tokenHash: hashToken(token),
      invitedByUserId: user.sub,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    select: { id: true, email: true, expiresAt: true },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "PortalInvite",
    entityId: invite.id,
    newValues: { customerId, email: input.email },
    reason: `Portal access invited for ${customer.name}`,
  });

  return {
    invite: serialize(invite),
    /**
     * The path the customer opens. It is relative so the client can prefix its
     * own origin — the server has no reliable idea what host the browser used.
     */
    invitePath: `/invite/${token}`,
    /** Shown once, then unrecoverable. */
    token,
  };
}

export async function revokeInvite(user: AuthUser, customerId: string, inviteId: string) {
  const invite = await prisma.portalInvite.findFirst({
    where: { id: inviteId, customerId },
    select: { id: true, email: true, acceptedAt: true, revokedAt: true },
  });

  if (!invite) {
    throw new NotFoundError("Invitation not found");
  }

  if (invite.acceptedAt) {
    throw new ValidationError("That invitation has already been accepted", [
      "inviteId: already accepted",
    ]);
  }

  if (invite.revokedAt) {
    throw new ValidationError("That invitation is already revoked", [
      "inviteId: already revoked",
    ]);
  }

  await prisma.portalInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "PortalInvite",
    entityId: inviteId,
    newValues: { revoked: true, email: invite.email },
    reason: "Portal invitation revoked",
  });

  return getPortalAccess(customerId);
}

/** Removes an existing contact's access. The user account itself survives. */
export async function revokeAccess(user: AuthUser, customerId: string, userId: string) {
  const link = await prisma.customerUser.findFirst({
    where: { customerId, userId },
    select: { id: true, user: { select: { email: true } } },
  });

  if (!link) {
    throw new NotFoundError("That contact does not have access to this account");
  }

  await prisma.customerUser.delete({ where: { id: link.id } });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.DELETE,
    entityType: "CustomerUser",
    entityId: link.id,
    newValues: { customerId, email: link.user.email },
    reason: "Portal access revoked",
  });

  return getPortalAccess(customerId);
}

/* ── the public half: what the invited person does ── */

/**
 * Looks up an invitation for the acceptance screen. Deliberately says nothing
 * about *why* a token is unusable beyond expiry, so a stale link cannot be used
 * to probe which invitations exist.
 */
export async function describeInvite(token: string) {
  const invite = await prisma.portalInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      customer: { select: { name: true } },
    },
  });

  if (!invite || invite.revokedAt || invite.acceptedAt) {
    throw new NotFoundError("This invitation link is no longer valid");
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("This invitation has expired", [
      "token: expired — ask your account manager for a new link",
    ]);
  }

  return {
    email: invite.email,
    firstName: invite.firstName,
    lastName: invite.lastName,
    customerName: invite.customer.name,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/**
 * Accepts an invitation: creates the portal user if they are new, links them to
 * the account, and signs them straight in so the link lands them on their
 * quotations rather than back at a login form.
 */
export async function acceptInvite(token: string, input: AcceptInviteInput) {
  const tokenHash = hashToken(token);

  const invite = await prisma.portalInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      customerId: true,
      email: true,
      firstName: true,
      lastName: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });

  if (!invite || invite.revokedAt || invite.acceptedAt) {
    throw new NotFoundError("This invitation link is no longer valid");
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("This invitation has expired", [
      "token: expired — ask your account manager for a new link",
    ]);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });

    // A contact invited to a second account keeps one login; only the link is
    // new, and their existing password is left alone.
    const account = existing
      ? await tx.user.findUniqueOrThrow({
          where: { id: existing.id },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : await tx.user.create({
          data: {
            email: invite.email,
            passwordHash,
            firstName: invite.firstName,
            lastName: invite.lastName,
            userRoles: {
              create: {
                role: {
                  connectOrCreate: {
                    where: { name: "CUSTOMER" },
                    create: { name: "CUSTOMER" },
                  },
                },
              },
            },
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });

    const linkCount = await tx.customerUser.count({
      where: { customerId: invite.customerId },
    });

    await tx.customerUser.create({
      data: {
        customerId: invite.customerId,
        userId: account.id,
        // The first contact on an account is its primary one.
        isPrimary: linkCount === 0,
      },
    });

    // Accepting is a sign-in — the caller is handed a session — so it counts
    // as one. Without this the rep's portal-access panel would report a
    // contact who is actively using the portal as "never signed in".
    await tx.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    // Single use: marking it accepted inside the transaction means two
    // simultaneous accepts cannot both create a link.
    await tx.portalInvite.update({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date(), acceptedUserId: account.id },
    });

    return account;
  });

  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: { select: { name: true } } },
  });

  const roleNames = roles.map((entry) => entry.role.name as "CUSTOMER");

  await recordAudit({
    actorUserId: user.id,
    action: AUDIT_ACTION.CREATE,
    entityType: "CustomerUser",
    entityId: invite.customerId,
    newValues: { email: user.email },
    reason: "Portal invitation accepted",
  });

  return {
    token: signToken({ sub: user.id, email: user.email, roles: roleNames }),
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: roleNames,
    },
  };
}

/** Kept for the seed's sake — the default role a self-signup receives. */
export { DEFAULT_USER_ROLE };
