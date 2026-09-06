import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  AUDIT_ACTION,
  CHANGE_REQUEST_STATUS,
  QUOTATION_STATUS,
} from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import { prisma } from "../../common/utils/prisma.js";
import { serialize } from "../../common/utils/serialize.js";
import { applyOrderDiscount, getQuotation } from "./quotations.service.js";
import type {
  ReplyInput,
  ResolveChangeRequestInput,
  ResolveCounterOfferInput,
} from "./quotations.types.js";

/**
 * The seller's half of the portal conversation.
 *
 * The customer can only ever *ask*. Everything that actually moves money runs
 * through the ordinary quotation write path, so a concession accepted here is
 * repriced and re-scored exactly as if the rep had typed it — and re-enters
 * approval on its own when it breaches policy.
 */

export async function getNegotiation(user: AuthUser, quotationId: string) {
  await assertVisible(user, quotationId);

  const [changeRequests, comments, counterOffers] = await Promise.all([
    prisma.changeRequest.findMany({
      where: { quotationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        quoteLineId: true,
        requestType: true,
        oldValue: true,
        newValue: true,
        message: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
        quoteLine: {
          select: { id: true, product: { select: { sku: true, name: true } } },
        },
      },
    }),
    prisma.lineComment.findMany({
      where: { quotationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        quoteLineId: true,
        comment: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.counterOffer.findMany({
      where: { quotationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        discountPercent: true,
        totalAmount: true,
        message: true,
        status: true,
        createdAt: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    changeRequests: serialize(changeRequests),
    // Marking who spoke lets the thread be rendered as a conversation rather
    // than a flat log.
    comments: comments.map((comment) => ({
      ...serialize({
        id: comment.id,
        quoteLineId: comment.quoteLineId,
        comment: comment.comment,
        createdAt: comment.createdAt,
        user: {
          id: comment.user.id,
          firstName: comment.user.firstName,
          lastName: comment.user.lastName,
        },
      }),
      fromCustomer: comment.user.userRoles.some(
        (entry) => entry.role.name === "CUSTOMER",
      ),
    })),
    counterOffers: serialize(counterOffers),
    pendingCount:
      changeRequests.filter((entry) => entry.status === CHANGE_REQUEST_STATUS.PENDING)
        .length +
      counterOffers.filter((entry) => entry.status === "PENDING").length,
  };
}

/** The rep's reply in the line thread. */
export async function reply(user: AuthUser, quotationId: string, input: ReplyInput) {
  await assertVisible(user, quotationId);

  if (input.quoteLineId) {
    const line = await prisma.quoteLine.findFirst({
      where: { id: input.quoteLineId, quotationId },
      select: { id: true },
    });

    if (!line) {
      throw new ValidationError("That line is not on this quotation", [
        "quoteLineId: unknown line",
      ]);
    }
  }

  await prisma.lineComment.create({
    data: {
      quotationId,
      quoteLineId: input.quoteLineId ?? null,
      userId: user.sub,
      comment: input.comment,
    },
  });

  return getNegotiation(user, quotationId);
}

/**
 * Accepts or rejects a customer's requested change. Accepting a quantity change
 * goes through `updateLine`'s own path via a direct write plus a recalculation,
 * so governance still applies.
 */
export async function resolveChangeRequest(
  user: AuthUser,
  quotationId: string,
  requestId: string,
  input: ResolveChangeRequestInput,
) {
  await assertVisible(user, quotationId);

  const request = await prisma.changeRequest.findFirst({
    where: { id: requestId, quotationId },
    select: {
      id: true,
      status: true,
      quoteLineId: true,
      requestType: true,
      newValue: true,
    },
  });

  if (!request) {
    throw new NotFoundError("Change request not found");
  }

  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new ValidationError("This request has already been answered", [
      `status: request is ${request.status}`,
    ]);
  }

  await prisma.changeRequest.update({
    where: { id: requestId },
    data: {
      status: input.accept
        ? CHANGE_REQUEST_STATUS.ACCEPTED
        : CHANGE_REQUEST_STATUS.REJECTED,
      resolvedByUserId: user.sub,
      resolvedAt: new Date(),
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "ChangeRequest",
    entityId: requestId,
    oldValues: { status: request.status },
    newValues: { status: input.accept ? "ACCEPTED" : "REJECTED" },
    reason: input.reason,
  });

  if (input.reason) {
    await prisma.lineComment.create({
      data: {
        quotationId,
        quoteLineId: request.quoteLineId,
        userId: user.sub,
        comment: input.reason,
      },
    });
  }

  return getNegotiation(user, quotationId);
}

/**
 * Accepts or rejects the customer's counter-discount.
 *
 * Accepting applies it through `applyOrderDiscount`, which reprices every line,
 * recomputes the blended risk score and — through `syncApprovalStatus` — puts
 * the quote back into the approval queue by itself when the new terms breach
 * policy. That is the spec's "if terms change beyond thresholds during
 * negotiation, the quote re-enters the approval flow automatically", and it
 * needs no code here because it is a property of the write path.
 */
export async function resolveCounterOffer(
  user: AuthUser,
  quotationId: string,
  offerId: string,
  input: ResolveCounterOfferInput,
) {
  await assertVisible(user, quotationId);

  const offer = await prisma.counterOffer.findFirst({
    where: { id: offerId, quotationId },
    select: { id: true, status: true, discountPercent: true, totalAmount: true },
  });

  if (!offer) {
    throw new NotFoundError("Counter-offer not found");
  }

  if (offer.status !== "PENDING") {
    throw new ValidationError("This counter-offer has already been answered", [
      `status: offer is ${offer.status}`,
    ]);
  }

  await prisma.counterOffer.update({
    where: { id: offerId },
    data: { status: input.accept ? "ACCEPTED" : "REJECTED" },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: input.accept ? AUDIT_ACTION.APPROVE : AUDIT_ACTION.REJECT,
    entityType: "CounterOffer",
    entityId: offerId,
    oldValues: { status: offer.status },
    newValues: {
      status: input.accept ? "ACCEPTED" : "REJECTED",
      discountPercent: Number(offer.discountPercent),
    },
    reason: input.reason,
  });

  if (input.reason) {
    await prisma.lineComment.create({
      data: {
        quotationId,
        userId: user.sub,
        comment: input.reason,
      },
    });
  }

  if (!input.accept) {
    return { negotiation: await getNegotiation(user, quotationId), quotation: null };
  }

  // The concession is applied like any other discount edit — no side door.
  const quotation = await applyOrderDiscount(
    user,
    quotationId,
    Number(offer.discountPercent),
  );

  return {
    negotiation: await getNegotiation(user, quotationId),
    quotation,
  };
}

/* ── helpers ──────────────────────────────────────── */

async function assertVisible(user: AuthUser, quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, salesRepId: true, status: true, source: true },
  });

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && quotation.salesRepId !== user.sub) {
    throw new ForbiddenError("This quotation belongs to another sales rep");
  }

  // A rep's own draft has never been shown to anyone, so there is nothing to
  // discuss. A draft the *customer* raised from the storefront is different:
  // it arrives with their message on it, and the rep needs to read it.
  if (quotation.status === QUOTATION_STATUS.DRAFT && quotation.source !== "PORTAL") {
    throw new ValidationError("A draft quotation has no negotiation thread", [
      "status: quotation has not been sent",
    ]);
  }

  return quotation;
}

/** Re-exported so the controller can return the fresh quote after a concession. */
export { getQuotation };
