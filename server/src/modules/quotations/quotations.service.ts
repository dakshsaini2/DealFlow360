import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  APPROVAL_STATUS,
  AUDIT_ACTION,
  QUOTATION_STATUS,
} from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { prisma } from "../../common/utils/prisma.js";
import { serialize } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";
import { resolvePricing, type PricedLine } from "../catalog/pricing.service.js";
import { calculateRisk, type RiskBreakdown } from "./risk.service.js";
import {
  cancelOpenInstances,
  openApprovalInstance,
} from "../approvals/approvals.service.js";
import type {
  AddLineInput,
  CreateQuotationInput,
  ListQuotationsQuery,
  UpdateLineInput,
  UpdateQuotationInput,
} from "./quotations.types.js";

/** Statuses whose lines may still be edited by the rep. */
const EDITABLE_STATUSES: string[] = [
  QUOTATION_STATUS.DRAFT,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
];

const LIST_SELECT = {
  id: true,
  quoteNumber: true,
  status: true,
  approvalStatus: true,
  approvalRequired: true,
  currencyCode: true,
  subtotal: true,
  discountTotal: true,
  taxTotal: true,
  grandTotal: true,
  blendedRiskScore: true,
  validUntil: true,
  sentAt: true,
  versionNumber: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      customerCode: true,
      customerTier: { select: { id: true, name: true } },
    },
  },
  salesRep: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { lines: true } },
} as const;

/**
 * Managers, finance and admins see the whole book; a rep sees only their own
 * deals. `scope=mine` lets anyone narrow to theirs.
 */
function visibilityFilter(user: AuthUser, scope: "all" | "mine") {
  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  return orgWide && scope === "all" ? {} : { salesRepId: user.sub };
}

export async function listQuotations(
  user: AuthUser,
  query: ListQuotationsQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const where = {
    ...visibilityFilter(user, query.scope),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.salesRepId ? { salesRepId: query.salesRepId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
    ...(query.q
      ? {
          OR: [
            { quoteNumber: { contains: query.q, mode: "insensitive" as const } },
            {
              customer: {
                name: { contains: query.q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy =
    query.sort === "created"
      ? { createdAt: "desc" as const }
      : query.sort === "value"
        ? { grandTotal: "desc" as const }
        : { updatedAt: "desc" as const };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy,
      skip: page.skip,
      take: page.take,
      select: LIST_SELECT,
    }),
    prisma.quotation.count({ where }),
  ]);

  return paginated(serialize(rows), total, page);
}

export async function getQuotation(user: AuthUser, id: string) {
  const quotation = await loadForRead(user, id);
  const risk = await riskFor(id);

  return {
    quotation: serialize(quotation),
    risk,
  };
}

export async function createQuotation(
  user: AuthUser,
  input: CreateQuotationInput,
) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, isActive: true },
  });

  if (!customer) {
    throw new NotFoundError("Customer not found");
  }

  if (!customer.isActive) {
    throw new ValidationError("Cannot quote an archived customer", [
      "customerId: customer is archived",
    ]);
  }

  const validityDays = await getNumericSetting("QUOTE_VALIDITY_DAYS");
  const validUntil = input.validUntil
    ? new Date(input.validUntil)
    : new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

  for (const line of input.lines ?? []) {
    await assertPlanSellsProduct(line.productId, line.subscriptionPlanId);
  }

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber: await nextQuoteNumber(),
      customerId: input.customerId,
      salesRepId: user.sub,
      currencyCode: input.currencyCode,
      status: QUOTATION_STATUS.DRAFT,
      approvalStatus: APPROVAL_STATUS.NOT_REQUIRED,
      validUntil,
      lines: input.lines?.length
        ? {
            create: input.lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId ?? null,
              description: line.description ?? null,
              quantity: line.quantity,
              // Real figures land in the recalculation immediately below.
              unitPrice: 0,
              discountPercent: line.discountPercent,
              subscriptionPlanId: line.subscriptionPlanId ?? null,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  await recalculate(quotation.id);

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "Quotation",
    entityId: quotation.id,
    newValues: { customerId: input.customerId, lines: input.lines?.length ?? 0 },
  });

  return getQuotation(user, quotation.id);
}

export async function updateQuotation(
  user: AuthUser,
  id: string,
  input: UpdateQuotationInput,
) {
  const existing = await loadForWrite(user, id);

  await prisma.quotation.update({
    where: { id },
    data: {
      ...(input.validUntil !== undefined
        ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
        : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "Quotation",
    entityId: id,
    oldValues: { validUntil: existing.validUntil, teamId: existing.teamId },
    newValues: input,
  });

  return getQuotation(user, id);
}

export async function addLine(user: AuthUser, id: string, input: AddLineInput) {
  await loadForWrite(user, id);
  await assertPlanSellsProduct(input.productId, input.subscriptionPlanId);

  const line = await prisma.quoteLine.create({
    data: {
      quotationId: id,
      productId: input.productId,
      variantId: input.variantId ?? null,
      description: input.description ?? null,
      quantity: input.quantity,
      unitPrice: 0,
      discountPercent: input.discountPercent,
      subscriptionPlanId: input.subscriptionPlanId ?? null,
    },
    select: { id: true },
  });

  await recalculate(id);
  await snapshotIfSent(user, id, "Line added");

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "QuoteLine",
    entityId: line.id,
    newValues: input,
    reason: "Line added",
  });

  return getQuotation(user, id);
}

export async function updateLine(
  user: AuthUser,
  id: string,
  lineId: string,
  input: UpdateLineInput,
) {
  await loadForWrite(user, id);

  const existing = await prisma.quoteLine.findFirst({
    where: { id: lineId, quotationId: id },
    select: {
      id: true,
      productId: true,
      quantity: true,
      discountPercent: true,
      description: true,
      subscriptionPlanId: true,
    },
  });

  if (!existing) {
    throw new NotFoundError("Quote line not found");
  }

  if (input.subscriptionPlanId !== undefined) {
    await assertPlanSellsProduct(
      existing.productId,
      input.subscriptionPlanId ?? undefined,
    );
  }

  await prisma.quoteLine.update({
    where: { id: lineId },
    data: {
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.discountPercent !== undefined
        ? { discountPercent: input.discountPercent }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.subscriptionPlanId !== undefined
        ? { subscriptionPlanId: input.subscriptionPlanId }
        : {}),
    },
  });

  await recalculate(id);
  await snapshotIfSent(user, id, "Line changed");

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "QuoteLine",
    entityId: lineId,
    oldValues: {
      quantity: Number(existing.quantity),
      discountPercent: Number(existing.discountPercent),
      subscriptionPlanId: existing.subscriptionPlanId,
    },
    newValues: input,
  });

  return getQuotation(user, id);
}

export async function removeLine(user: AuthUser, id: string, lineId: string) {
  await loadForWrite(user, id);

  const deleted = await prisma.quoteLine.deleteMany({
    where: { id: lineId, quotationId: id },
  });

  if (deleted.count === 0) {
    throw new NotFoundError("Quote line not found");
  }

  await recalculate(id);
  await snapshotIfSent(user, id, "Line removed");

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.DELETE,
    entityType: "QuoteLine",
    entityId: lineId,
  });

  return getQuotation(user, id);
}

/** Sets the same discount on every line — the order-level discount control. */
export async function applyOrderDiscount(
  user: AuthUser,
  id: string,
  discountPercent: number,
) {
  await loadForWrite(user, id);

  await prisma.quoteLine.updateMany({
    where: { quotationId: id },
    data: { discountPercent },
  });

  await recalculate(id);
  await snapshotIfSent(user, id, `Order discount set to ${discountPercent}%`);

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "Quotation",
    entityId: id,
    newValues: { orderDiscountPercent: discountPercent },
    reason: "Order-level discount applied",
  });

  return getQuotation(user, id);
}

/**
 * Draft to sent. The risk score decides whether the quote lands in the
 * approval queue — the rep never asks for approval by hand.
 */
export async function sendQuotation(user: AuthUser, id: string, reason?: string) {
  const quotation = await loadForWrite(user, id);

  if (quotation.status !== QUOTATION_STATUS.DRAFT) {
    throw new ValidationError("Only a draft quotation can be sent", [
      `status: quotation is ${quotation.status}`,
    ]);
  }

  if (quotation._count.lines === 0) {
    throw new ValidationError("Cannot send an empty quotation", [
      "lines: add at least one line",
    ]);
  }

  const { approvalRequired, risk } = await recalculate(id);

  await prisma.quotation.update({
    where: { id },
    data: {
      status: QUOTATION_STATUS.SENT,
      sentAt: new Date(),
      approvalStatus: approvalRequired
        ? APPROVAL_STATUS.PENDING
        : APPROVAL_STATUS.NOT_REQUIRED,
    },
  });

  // The recalculation above ran while this was still a draft, so it skipped
  // building the chain. Now that the quote has actually gone out, route it.
  if (approvalRequired) {
    await openApprovalInstance(id, risk.score, risk.reason);
  }

  await snapshot(user, id, reason ?? "Quotation sent");

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.STATUS_CHANGE,
    entityType: "Quotation",
    entityId: id,
    oldValues: { status: quotation.status },
    newValues: {
      status: QUOTATION_STATUS.SENT,
      approvalRequired,
    },
    reason,
  });

  return getQuotation(user, id);
}

export async function listRevisions(user: AuthUser, id: string) {
  await loadForRead(user, id);

  const revisions = await prisma.quoteRevision.findMany({
    where: { quotationId: id },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      changeReason: true,
      createdAt: true,
      snapshotData: true,
      changedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return serialize(revisions);
}

/* ── recalculation ────────────────────────────────── */

/**
 * The single write path for money on a quotation. Every mutation ends here:
 * lines are re-priced through the catalog engine, the per-line governance
 * figures are stored, the header totals are summed and the blended risk score
 * is recomputed. Nothing else may write these columns, so the stored numbers
 * can never drift from the pricing rules.
 */
export async function recalculate(id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: {
      id: true,
      customerId: true,
      currencyCode: true,
      status: true,
      approvalStatus: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          variantId: true,
          quantity: true,
          discountPercent: true,
        },
      },
    },
  });

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  if (quotation.lines.length === 0) {
    await prisma.quotation.update({
      where: { id },
      data: {
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        blendedRiskScore: 0,
        approvalRequired: false,
        priceListId: null,
      },
    });

    return { approvalRequired: false, risk: calculateRisk([]), priced: [] };
  }

  const pricing = await resolvePricing({
    customerId: quotation.customerId,
    currencyCode: quotation.currencyCode,
    lines: quotation.lines.map((line) => ({
      productId: line.productId,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      quantity: Number(line.quantity),
      discountPercent: Number(line.discountPercent),
    })),
  });

  const risk = calculateRisk(pricing.lines);
  const threshold = await getNumericSetting("APPROVAL_RISK_THRESHOLD");
  const approvalRequired = risk.score >= threshold;

  const nextApprovalStatus = syncApprovalStatus(
    quotation.status,
    quotation.approvalStatus,
    approvalRequired,
  );

  // Lines came back in the order they were sent, so index alignment is safe.
  await prisma.$transaction([
    ...quotation.lines.map((line, index) =>
      prisma.quoteLine.update({
        where: { id: line.id },
        data: toLineData(pricing.lines[index]!),
      }),
    ),
    prisma.quotation.update({
      where: { id },
      data: {
        subtotal: pricing.totals.subtotal,
        discountTotal: pricing.totals.discountTotal,
        taxTotal: pricing.totals.taxTotal,
        grandTotal: pricing.totals.grandTotal,
        blendedRiskScore: risk.score,
        approvalRequired,
        priceListId: pricing.priceList?.id ?? null,
        ...(nextApprovalStatus === null
          ? {}
          : { approvalStatus: nextApprovalStatus }),
      },
    }),
  ]);

  // Keep the approval chain in step with the score: open or rebuild it when
  // approval is needed, close it when the quote comes back inside policy.
  // Drafts are exempt — approval only becomes real once the quote is sent.
  if (quotation.status !== QUOTATION_STATUS.DRAFT) {
    if (approvalRequired) {
      await openApprovalInstance(id, risk.score, risk.reason);
    } else {
      await cancelOpenInstances(id, "Quotation is back inside policy");
    }
  }

  if (nextApprovalStatus !== null) {
    await recordAudit({
      actorUserId: null,
      action: AUDIT_ACTION.STATUS_CHANGE,
      entityType: "Quotation",
      entityId: id,
      oldValues: { approvalStatus: quotation.approvalStatus },
      newValues: { approvalStatus: nextApprovalStatus, riskScore: risk.score },
      reason: `Recalculation: ${risk.reason}`,
    });
  }

  return { approvalRequired, risk, priced: pricing.lines };
}

function toLineData(priced: PricedLine) {
  return {
    unitPrice: priced.unitPrice,
    costPrice: priced.costPrice,
    discountAmount: priced.discountAmount,
    taxPercent: priced.taxPercent,
    taxAmount: priced.taxAmount,
    lineSubtotal: priced.lineSubtotal,
    lineTotal: priced.lineTotal,
    allowedDiscountPercent: priced.maxDiscountPercent,
    discountExcessPercent: priced.discountExcessPercent,
    marginAmount: priced.marginAmount,
    marginPercent: priced.marginPercent,
  };
}

/**
 * Keeps the approval state honest after every recalculation. A quote that has
 * gone out and then drifts over the threshold re-enters approval on its own,
 * and one discounted back to a safe level stops asking for it — the rep never
 * requests or cancels approval by hand. Drafts are exempt: approval only
 * becomes meaningful once the quote has been sent.
 *
 * Returns the new status, or null when it should not change.
 */
function syncApprovalStatus(
  status: string,
  approvalStatus: string,
  approvalRequired: boolean,
): string | null {
  if (status === QUOTATION_STATUS.DRAFT) {
    return null;
  }

  if (approvalRequired) {
    return approvalStatus === APPROVAL_STATUS.PENDING
      ? null
      : APPROVAL_STATUS.PENDING;
  }

  // A rejection is a human decision; only leave it behind when the rep has
  // actually brought the terms back inside policy, which is this branch.
  return approvalStatus === APPROVAL_STATUS.PENDING ||
    approvalStatus === APPROVAL_STATUS.REJECTED ||
    approvalStatus === APPROVAL_STATUS.RETURNED
    ? APPROVAL_STATUS.NOT_REQUIRED
    : null;
}

/** Recomputes risk for display without writing anything. */
async function riskFor(id: string): Promise<RiskBreakdown> {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: {
      customerId: true,
      currencyCode: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          variantId: true,
          quantity: true,
          discountPercent: true,
        },
      },
    },
  });

  if (!quotation || quotation.lines.length === 0) {
    return calculateRisk([]);
  }

  const pricing = await resolvePricing({
    customerId: quotation.customerId,
    currencyCode: quotation.currencyCode,
    lines: quotation.lines.map((line) => ({
      productId: line.productId,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      quantity: Number(line.quantity),
      discountPercent: Number(line.discountPercent),
    })),
  });

  return calculateRisk(pricing.lines);
}

/* ── revisions ────────────────────────────────────── */

/**
 * A quote that has already gone out is a document the customer has seen, so
 * every later change is versioned. Draft edits are not, or the history would
 * be one entry per keystroke.
 */
async function snapshotIfSent(user: AuthUser, id: string, reason: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: { status: true },
  });

  if (quotation && quotation.status !== QUOTATION_STATUS.DRAFT) {
    await snapshot(user, id, reason);
  }
}

async function snapshot(user: AuthUser, id: string, reason: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: {
      versionNumber: true,
      status: true,
      approvalStatus: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      grandTotal: true,
      blendedRiskScore: true,
      lines: {
        select: {
          productId: true,
          variantId: true,
          description: true,
          quantity: true,
          unitPrice: true,
          discountPercent: true,
          lineTotal: true,
          marginPercent: true,
        },
      },
    },
  });

  if (!quotation) {
    return;
  }

  const versionNumber = quotation.versionNumber + 1;

  await prisma.$transaction([
    prisma.quoteRevision.create({
      data: {
        quotationId: id,
        versionNumber,
        changedByUserId: user.sub,
        changeReason: reason,
        snapshotData: serialize(quotation) as object,
      },
    }),
    prisma.quotation.update({ where: { id }, data: { versionNumber } }),
  ]);
}

/* ── access ───────────────────────────────────────── */

const DETAIL_SELECT = {
  ...LIST_SELECT,
  teamId: true,
  customer: {
    select: {
      id: true,
      name: true,
      customerCode: true,
      email: true,
      billingAddress: true,
      shippingAddress: true,
      customerTier: {
        select: { id: true, name: true, defaultDiscountCeiling: true },
      },
    },
  },
  priceList: { select: { id: true, name: true } },
  lines: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      productId: true,
      variantId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      costPrice: true,
      discountPercent: true,
      discountAmount: true,
      taxPercent: true,
      taxAmount: true,
      lineSubtotal: true,
      lineTotal: true,
      allowedDiscountPercent: true,
      discountExcessPercent: true,
      marginAmount: true,
      marginPercent: true,
      subscriptionPlanId: true,
      subscriptionPlan: {
        select: {
          id: true,
          name: true,
          billingInterval: true,
          intervalCount: true,
        },
      },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          category: { select: { id: true, name: true } },
          // Which recurring plans this product may be sold on, so the builder
          // can offer the choice without a second round trip.
          productSubscriptionPlans: {
            select: {
              subscriptionPlan: {
                select: {
                  id: true,
                  name: true,
                  billingInterval: true,
                  intervalCount: true,
                },
              },
            },
          },
        },
      },
      variant: { select: { id: true, sku: true, name: true } },
    },
  },
} as const;

async function loadForRead(user: AuthUser, id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: DETAIL_SELECT,
  });

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && quotation.salesRep.id !== user.sub) {
    throw new ForbiddenError("This quotation belongs to another sales rep");
  }

  return quotation;
}

/** Read access plus an editable status. */
async function loadForWrite(user: AuthUser, id: string) {
  const quotation = await loadForRead(user, id);

  if (!EDITABLE_STATUSES.includes(quotation.status)) {
    throw new ValidationError("This quotation can no longer be edited", [
      `status: quotation is ${quotation.status}`,
    ]);
  }

  return quotation;
}

/** `Q-2026-0001`, sequential within the calendar year. */
/**
 * A recurring line is only meaningful when the chosen plan is actually offered
 * for that product, so an arbitrary plan id cannot turn a laptop into a
 * subscription. `undefined` / `null` means an ordinary one-time line.
 */
async function assertPlanSellsProduct(
  productId: string,
  subscriptionPlanId: string | null | undefined,
) {
  if (!subscriptionPlanId) {
    return;
  }

  const pairing = await prisma.productSubscriptionPlan.findUnique({
    where: {
      productId_subscriptionPlanId: { productId, subscriptionPlanId },
    },
    select: { subscriptionPlan: { select: { isActive: true } } },
  });

  if (!pairing) {
    throw new ValidationError("This product is not sold on that plan", [
      "subscriptionPlanId: no such plan for this product",
    ]);
  }

  if (!pairing.subscriptionPlan.isActive) {
    throw new ValidationError("That subscription plan is no longer offered", [
      "subscriptionPlanId: plan is inactive",
    ]);
  }
}

async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;

  const latest = await prisma.quotation.findFirst({
    where: { quoteNumber: { startsWith: prefix } },
    orderBy: { quoteNumber: "desc" },
    select: { quoteNumber: true },
  });

  const current = Number(latest?.quoteNumber.slice(prefix.length) ?? 0);
  const next = (Number.isFinite(current) ? current : 0) + 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}
