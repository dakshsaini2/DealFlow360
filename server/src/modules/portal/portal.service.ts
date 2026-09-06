import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  APPROVAL_STATUS,
  AUDIT_ACTION,
  CHANGE_REQUEST_STATUS,
  QUOTATION_STATUS,
} from "../../common/constants/status.js";
import type { AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import type {
  CounterOfferInput,
  LineCommentInput,
  ChangeRequestInput,
  ListPortalQuotationsQuery,
} from "./portal.types.js";

/**
 * The customer-facing view.
 *
 * This is deliberately not the internal quotation projection with a different
 * label. Everything the seller uses to reason about the deal — cost price,
 * margin, the discount ceiling the line was checked against, the blended risk
 * score, who approved what — is absent from the shapes below, because a
 * customer reading their own quote must not be able to read the seller's
 * negotiating position out of it.
 *
 * What is left is what a customer legitimately needs: the terms, the totals,
 * and the tools to argue with them.
 */

/**
 * Statuses a customer may see. A rep's draft has never been shown to them, but
 * a draft the customer *submitted themselves* from the storefront obviously
 * has — so those are visible too, matched on `source`.
 */
const VISIBLE_STATUSES: string[] = [
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
  QUOTATION_STATUS.CONFIRMED,
  QUOTATION_STATUS.EXPIRED,
];

/** Matches either a quote sent to them, or their own portal request. */
function visibleToCustomer() {
  return {
    OR: [
      { status: { in: VISIBLE_STATUSES } },
      { status: QUOTATION_STATUS.DRAFT, source: "PORTAL" },
    ],
  };
}

/** Statuses the customer may still act on. */
const NEGOTIABLE_STATUSES: string[] = [
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
];

/**
 * What a customer is told about approval. The internal states leak how the
 * seller governs discounts, so they collapse into "with us" versus "ready".
 */
function customerFacingState(status: string, approvalStatus: string, source = "REP") {
  // A request the customer submitted that the rep has not sent back yet.
  if (status === QUOTATION_STATUS.DRAFT && source === "PORTAL") {
    return {
      label: "Awaiting pricing",
      detail: "Your request is with your account manager for pricing.",
    };
  }

  if (status === QUOTATION_STATUS.CONFIRMED) {
    return { label: "Confirmed", detail: "This quotation has been accepted." };
  }

  if (approvalStatus === APPROVAL_STATUS.PENDING) {
    return {
      label: "Under review",
      detail: "Your request is with our team for review.",
    };
  }

  if (status === QUOTATION_STATUS.UNDER_NEGOTIATION) {
    return {
      label: "Under negotiation",
      detail: "We are working through your requested changes.",
    };
  }

  if (status === QUOTATION_STATUS.EXPIRED) {
    return { label: "Expired", detail: "This quotation is past its valid-until date." };
  }

  return { label: "Ready to confirm", detail: "These terms are ready for your approval." };
}

/** The accounts this portal user is attached to. Their whole world. */
async function accessibleCustomerIds(user: AuthUser): Promise<string[]> {
  const links = await prisma.customerUser.findMany({
    where: { userId: user.sub },
    select: { customerId: true },
  });

  return links.map((link) => link.customerId);
}

export async function listQuotations(
  user: AuthUser,
  query: ListPortalQuotationsQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const customerIds = await accessibleCustomerIds(user);

  if (customerIds.length === 0) {
    return paginated([], 0, page);
  }

  const where = {
    customerId: { in: customerIds },
    ...(query.status
      ? { status: query.status, ...visibleToCustomer() }
      : visibleToCustomer()),
  };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        approvalStatus: true,
        source: true,
        currencyCode: true,
        grandTotal: true,
        validUntil: true,
        sentAt: true,
        versionNumber: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
        _count: { select: { lines: true, changeRequests: true } },
      },
    }),
    prisma.quotation.count({ where }),
  ]);

  return paginated(
    rows.map((row) => {
      const { approvalStatus, source, ...visible } = row;

      return {
        ...serialize(visible),
        state: customerFacingState(row.status, approvalStatus, row.source),
      };
    }),
    total,
    page,
  );
}

export async function getQuotation(user: AuthUser, id: string) {
  const quotation = await loadForCustomer(user, id);

  return shapeForCustomer(quotation);
}

/**
 * A line-level question. The rep answers it from the internal thread; nothing
 * about the deal changes until they act.
 */
export async function addComment(user: AuthUser, id: string, input: LineCommentInput) {
  const quotation = await loadForCustomer(user, id);

  await assertNegotiable(quotation.status);
  await assertLineBelongs(id, input.quoteLineId);

  await prisma.lineComment.create({
    data: {
      quotationId: id,
      quoteLineId: input.quoteLineId ?? null,
      userId: user.sub,
      comment: input.comment,
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "LineComment",
    entityId: id,
    newValues: { quoteLineId: input.quoteLineId ?? null },
    reason: "Customer comment from the portal",
  });

  return getQuotation(user, id);
}

/**
 * A change the customer wants: a different quantity, a line dropped, anything
 * they can describe. It is a *request* — the rep applies it, so governance is
 * never bypassed by the customer editing the quote directly.
 */
export async function requestChange(
  user: AuthUser,
  id: string,
  input: ChangeRequestInput,
) {
  const quotation = await loadForCustomer(user, id);

  await assertNegotiable(quotation.status);
  await assertLineBelongs(id, input.quoteLineId);

  const line = input.quoteLineId
    ? quotation.lines.find((entry) => entry.id === input.quoteLineId)
    : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.changeRequest.create({
      data: {
        quotationId: id,
        quoteLineId: input.quoteLineId ?? null,
        requestedByUserId: user.sub,
        requestType: input.requestType,
        oldValue: line
          ? { quantity: Number(line.quantity), discountPercent: Number(line.discountPercent) }
          : undefined,
        newValue: input.requestedQuantity !== undefined
          ? { quantity: input.requestedQuantity }
          : undefined,
        message: input.message,
        status: CHANGE_REQUEST_STATUS.PENDING,
      },
    });

    // An open request means the deal is being argued over, which is what
    // `UNDER_NEGOTIATION` records.
    if (quotation.status === QUOTATION_STATUS.SENT) {
      await tx.quotation.update({
        where: { id },
        data: { status: QUOTATION_STATUS.UNDER_NEGOTIATION },
      });
    }
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "ChangeRequest",
    entityId: id,
    newValues: { requestType: input.requestType, quoteLineId: input.quoteLineId ?? null },
    reason: input.message,
  });

  return getQuotation(user, id);
}

/**
 * The counter-discount. The customer proposes a number; the seller decides.
 *
 * Accepting it goes through the ordinary quotation write path, which reprices
 * every line, recomputes the blended risk score and re-routes for approval on
 * its own — so a counter that pushes the deal past policy cannot be accepted
 * quietly.
 */
export async function counterOffer(
  user: AuthUser,
  id: string,
  input: CounterOfferInput,
) {
  const quotation = await loadForCustomer(user, id);

  await assertNegotiable(quotation.status);

  const currentTotal = Number(quotation.grandTotal);
  // What the order would come to at the discount they are asking for, so both
  // sides are arguing about the same number.
  const proposedTotal = round2(
    quotation.lines.reduce((total, line) => {
      const gross = Number(line.quantity) * Number(line.unitPrice);
      const net = gross - gross * (input.discountPercent / 100);

      return total + net + net * (Number(line.taxPercent) / 100);
    }, 0),
  );

  await prisma.$transaction(async (tx) => {
    await tx.counterOffer.create({
      data: {
        quotationId: id,
        createdByUserId: user.sub,
        discountPercent: input.discountPercent,
        totalAmount: proposedTotal,
        message: input.message ?? null,
      },
    });

    if (quotation.status === QUOTATION_STATUS.SENT) {
      await tx.quotation.update({
        where: { id },
        data: { status: QUOTATION_STATUS.UNDER_NEGOTIATION },
      });
    }
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "CounterOffer",
    entityId: id,
    oldValues: { grandTotal: currentTotal },
    newValues: {
      discountPercent: input.discountPercent,
      proposedTotal,
    },
    reason: input.message ?? "Customer counter-offer",
  });

  return getQuotation(user, id);
}

/* ── helpers ──────────────────────────────────────── */

/**
 * The customer projection. Note what is *not* selected: `costPrice`,
 * `marginAmount`, `marginPercent`, `allowedDiscountPercent`,
 * `discountExcessPercent` and `blendedRiskScore` never leave the building.
 */
const CUSTOMER_SELECT = {
  id: true,
  quoteNumber: true,
  status: true,
  approvalStatus: true,
  source: true,
  currencyCode: true,
  subtotal: true,
  discountTotal: true,
  taxTotal: true,
  grandTotal: true,
  validUntil: true,
  sentAt: true,
  confirmedAt: true,
  versionNumber: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      customerCode: true,
      email: true,
      billingAddress: true,
      shippingAddress: true,
    },
  },
  salesRep: { select: { firstName: true, lastName: true } },
  lines: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountPercent: true,
      discountAmount: true,
      taxPercent: true,
      taxAmount: true,
      lineSubtotal: true,
      lineTotal: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          description: true,
          category: { select: { name: true } },
        },
      },
      variant: { select: { sku: true, name: true } },
      subscriptionPlan: {
        select: { id: true, name: true, billingInterval: true, intervalCount: true },
      },
    },
  },
  lineComments: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      quoteLineId: true,
      comment: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  changeRequests: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      quoteLineId: true,
      requestType: true,
      newValue: true,
      message: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  },
  counterOffers: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      discountPercent: true,
      totalAmount: true,
      message: true,
      status: true,
      createdAt: true,
    },
  },
} as const;

/** Exactly what `loadForCustomer` returns — kept in step with the select above. */
type CustomerQuotation = Awaited<ReturnType<typeof loadForCustomer>>;

function shapeForCustomer(quotation: CustomerQuotation) {
  const { approvalStatus, source, salesRep, ...visible } = quotation;

  return {
    quotation: {
      ...serialize(visible),
      // A name and nothing more — a customer does not need the rep's user id.
      contact: `${salesRep.firstName} ${salesRep.lastName}`,
    },
    state: customerFacingState(quotation.status, approvalStatus, source),
    /** A request still awaiting pricing has nothing to negotiate over yet. */
    canNegotiate: NEGOTIABLE_STATUSES.includes(quotation.status),
    /**
     * A customer may confirm only once the seller's own approval has cleared.
     * The reason is deliberately vague — "under review" — because the internal
     * threshold is not theirs to see.
     */
    canConfirm:
      NEGOTIABLE_STATUSES.includes(quotation.status) &&
      (approvalStatus === APPROVAL_STATUS.APPROVED ||
        approvalStatus === APPROVAL_STATUS.NOT_REQUIRED),
  };
}

async function loadForCustomer(user: AuthUser, id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: CUSTOMER_SELECT,
  });

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  const customerIds = await accessibleCustomerIds(user);

  if (!customerIds.includes(quotation.customer.id)) {
    // Deliberately the same error a missing quote gives, so the portal cannot
    // be used to discover which quote ids exist.
    throw new NotFoundError("Quotation not found");
  }

  const isOwnRequest =
    quotation.status === QUOTATION_STATUS.DRAFT && quotation.source === "PORTAL";

  if (!VISIBLE_STATUSES.includes(quotation.status) && !isOwnRequest) {
    throw new NotFoundError("Quotation not found");
  }

  return quotation;
}

async function assertNegotiable(status: string) {
  if (!NEGOTIABLE_STATUSES.includes(status)) {
    throw new ValidationError("This quotation is no longer open to changes", [
      `status: quotation is ${status.toLowerCase()}`,
    ]);
  }
}

async function assertLineBelongs(quotationId: string, quoteLineId?: string) {
  if (!quoteLineId) {
    return;
  }

  const line = await prisma.quoteLine.findFirst({
    where: { id: quoteLineId, quotationId },
    select: { id: true },
  });

  if (!line) {
    throw new ValidationError("That line is not on this quotation", [
      "quoteLineId: unknown line",
    ]);
  }
}

/** Guards the portal to users who actually hold a customer link. */
export async function assertPortalAccess(user: AuthUser) {
  const customerIds = await accessibleCustomerIds(user);

  if (customerIds.length === 0) {
    throw new ForbiddenError("This account is not linked to any customer");
  }
}
