import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  APPROVAL_STATUS,
  AUDIT_ACTION,
  LINE_TYPE,
  ORDER_STATUS,
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
import { round2, serialize } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";
import { issueOrderInvoice } from "../billing/invoices.service.js";
import { activateSubscriptionForOrder } from "../billing/subscriptions.service.js";
import type {
  CancelOrderInput,
  ConfirmQuotationInput,
  ListOrdersQuery,
} from "./orders.types.js";

/**
 * The only statuses a quotation may be confirmed from. A draft has never been
 * shown to anyone, and a confirmed one already has an order.
 */
const CONFIRMABLE_STATUSES: string[] = [
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
];

/**
 * Approval states that let a quotation through to an order. Everything else —
 * `PENDING`, `REJECTED`, `RETURNED` — is the governance engine still holding
 * the deal, and confirmation has to wait for it.
 */
const CONFIRMABLE_APPROVAL: string[] = [
  APPROVAL_STATUS.APPROVED,
  APPROVAL_STATUS.NOT_REQUIRED,
];

const LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  currencyCode: true,
  subtotal: true,
  discountTotal: true,
  taxTotal: true,
  grandTotal: true,
  promisedDeliveryDate: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
  quotation: { select: { id: true, quoteNumber: true } },
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

const DETAIL_SELECT = {
  ...LIST_SELECT,
  customer: {
    select: {
      id: true,
      name: true,
      customerCode: true,
      email: true,
      billingAddress: true,
      shippingAddress: true,
      customerTier: { select: { id: true, name: true } },
    },
  },
  quotation: {
    select: {
      id: true,
      quoteNumber: true,
      blendedRiskScore: true,
      approvalStatus: true,
      versionNumber: true,
    },
  },
  lines: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      productId: true,
      variantId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountPercent: true,
      discountAmount: true,
      taxAmount: true,
      lineTotal: true,
      lineType: true,
      sourceQuoteLineId: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          category: { select: { id: true, name: true } },
        },
      },
      variant: { select: { id: true, sku: true, name: true } },
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
} as const;

/**
 * Managers, finance and admins see the whole book; a rep sees only their own
 * orders. Mirrors the quotation rule so the two lists never disagree.
 */
function visibilityFilter(user: AuthUser, scope: "all" | "mine") {
  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  return orgWide && scope === "all" ? {} : { salesRepId: user.sub };
}

export async function listOrders(
  user: AuthUser,
  query: ListOrdersQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const where = {
    ...visibilityFilter(user, query.scope),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { orderNumber: { contains: query.q, mode: "insensitive" as const } },
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
    prisma.order.findMany({
      where,
      orderBy,
      skip: page.skip,
      take: page.take,
      select: LIST_SELECT,
    }),
    prisma.order.count({ where }),
  ]);

  return paginated(serialize(rows), total, page);
}

export async function getOrder(user: AuthUser, id: string) {
  const order = await loadForRead(user, id);

  return {
    order: serialize(order),
    billing: splitByBillingType(order.lines),
  };
}

/**
 * Quotation to order. This is the gate the whole governance engine exists to
 * protect: a quote only becomes a sellable order once approval has actually
 * cleared, and the check reads the stored approval state rather than trusting
 * the caller.
 */
export async function confirmQuotation(
  user: AuthUser,
  quotationId: string,
  input: ConfirmQuotationInput,
  /**
   * Who is confirming. An internal user must own the deal (or be org-wide); a
   * portal user must be attached to the customer the quote belongs to. Every
   * other rule below — approval cleared, not already ordered — is identical,
   * which is the point: a customer confirming from the portal goes through the
   * same gate a rep does.
   */
  channel: "internal" | "portal" = "internal",
) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      quoteNumber: true,
      customerId: true,
      salesRepId: true,
      currencyCode: true,
      status: true,
      approvalStatus: true,
      approvalRequired: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      grandTotal: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          variantId: true,
          subscriptionPlanId: true,
          description: true,
          quantity: true,
          unitPrice: true,
          discountPercent: true,
          discountAmount: true,
          taxAmount: true,
          lineTotal: true,
        },
      },
      orders: {
        where: { status: { not: ORDER_STATUS.CANCELLED } },
        select: { id: true, orderNumber: true },
      },
    },
  });

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  if (channel === "portal") {
    const link = await prisma.customerUser.findFirst({
      where: { userId: user.sub, customerId: quotation.customerId },
      select: { id: true },
    });

    if (!link) {
      throw new NotFoundError("Quotation not found");
    }
  } else {
    const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

    if (!orgWide && quotation.salesRepId !== user.sub) {
      throw new ForbiddenError("This quotation belongs to another sales rep");
    }
  }

  const existing = quotation.orders[0];

  if (existing) {
    throw new ValidationError(
      `This quotation is already on order ${existing.orderNumber}`,
      ["quotationId: an order already exists"],
    );
  }

  if (!CONFIRMABLE_STATUSES.includes(quotation.status)) {
    throw new ValidationError(
      "Only a sent or under-negotiation quotation can be confirmed",
      [`status: quotation is ${quotation.status}`],
    );
  }

  if (quotation.lines.length === 0) {
    throw new ValidationError("Cannot confirm an empty quotation", [
      "lines: add at least one line",
    ]);
  }

  if (!CONFIRMABLE_APPROVAL.includes(quotation.approvalStatus)) {
    throw new ValidationError(
      quotation.approvalStatus === APPROVAL_STATUS.PENDING
        ? "This quotation is still waiting for approval"
        : `This quotation cannot be confirmed while approval is ${quotation.approvalStatus}`,
      [`approvalStatus: ${quotation.approvalStatus}`],
    );
  }

  const [scheduleHorizon, invoiceDueDays] = await Promise.all([
    getNumericSetting("BILLING_SCHEDULE_HORIZON"),
    getNumericSetting("INVOICE_DUE_DAYS"),
  ]);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx),
        quotationId: quotation.id,
        customerId: quotation.customerId,
        salesRepId: quotation.salesRepId,
        status: ORDER_STATUS.CONFIRMED,
        currencyCode: quotation.currencyCode,
        // Copied, never recomputed: the customer agreed to these numbers, and a
        // later price-list change must not silently move them.
        subtotal: quotation.subtotal,
        discountTotal: quotation.discountTotal,
        taxTotal: quotation.taxTotal,
        grandTotal: quotation.grandTotal,
        promisedDeliveryDate: input.promisedDeliveryDate
          ? new Date(input.promisedDeliveryDate)
          : null,
        confirmedAt: new Date(),
        lines: {
          create: quotation.lines.map((line) => ({
            sourceQuoteLineId: line.id,
            productId: line.productId,
            variantId: line.variantId,
            subscriptionPlanId: line.subscriptionPlanId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            // The plan on the quote line is what makes this recurring; every
            // other line bills once. This is the split B7 renders.
            lineType: line.subscriptionPlanId
              ? LINE_TYPE.RECURRING
              : LINE_TYPE.ONE_TIME,
          })),
        },
      },
      select: { id: true, orderNumber: true },
    });

    await tx.quotation.update({
      where: { id: quotation.id },
      data: {
        status: QUOTATION_STATUS.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    // Billing starts the moment the deal closes, and the two tracks are raised
    // separately: recurring lines get a forward schedule, one-time lines get an
    // invoice now. Both are no-ops when the order has no lines of that kind, so
    // a pure-hardware and a pure-subscription order both work unchanged.
    const subscriptionId = await activateSubscriptionForOrder(
      tx,
      created.id,
      scheduleHorizon,
    );
    const invoiceId = await issueOrderInvoice(tx, created.id, invoiceDueDays);

    return { ...created, subscriptionId, invoiceId };
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.STATUS_CHANGE,
    entityType: "Quotation",
    entityId: quotation.id,
    oldValues: { status: quotation.status },
    newValues: {
      status: QUOTATION_STATUS.CONFIRMED,
      orderId: order.id,
      orderNumber: order.orderNumber,
    },
    reason: input.reason ?? "Quotation confirmed",
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "Order",
    entityId: order.id,
    newValues: {
      orderNumber: order.orderNumber,
      quoteNumber: quotation.quoteNumber,
      lines: quotation.lines.length,
      grandTotal: Number(quotation.grandTotal),
      subscriptionId: order.subscriptionId,
      invoiceId: order.invoiceId,
    },
  });

  // A portal user has no business reading the internal order projection, so
  // they get the confirmation, not the order.
  if (channel === "portal") {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      confirmed: true,
    };
  }

  return getOrder(user, order.id);
}

export async function cancelOrder(
  user: AuthUser,
  id: string,
  input: CancelOrderInput,
) {
  const order = await loadForRead(user, id);

  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new ValidationError("This order is already cancelled", [
      "status: already cancelled",
    ]);
  }

  if (order.status === ORDER_STATUS.FULFILLED) {
    throw new ValidationError("A fulfilled order cannot be cancelled", [
      "status: order is fulfilled",
    ]);
  }

  await prisma.order.update({
    where: { id },
    data: { status: ORDER_STATUS.CANCELLED },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.STATUS_CHANGE,
    entityType: "Order",
    entityId: id,
    oldValues: { status: order.status },
    newValues: { status: ORDER_STATUS.CANCELLED },
    reason: input.reason,
  });

  return getOrder(user, id);
}

/* ── helpers ──────────────────────────────────────── */

type BillingLine = {
  lineType: string;
  lineTotal: unknown;
  subscriptionPlan: { name: string; billingInterval: string } | null;
};

/**
 * One order carries both billing types, so the totals a customer actually owes
 * are two different numbers: what is invoiced once, and what recurs every
 * period. Summing them into a single "order total" would be misleading, which
 * is why B7 shows them side by side.
 */
function splitByBillingType(lines: readonly BillingLine[]) {
  let oneTimeTotal = 0;
  let recurringTotal = 0;
  let oneTimeCount = 0;
  let recurringCount = 0;

  for (const line of lines) {
    const amount = Number(line.lineTotal);

    if (line.lineType === LINE_TYPE.RECURRING) {
      recurringTotal += amount;
      recurringCount += 1;
    } else {
      oneTimeTotal += amount;
      oneTimeCount += 1;
    }
  }

  return {
    oneTime: { lineCount: oneTimeCount, total: round2(oneTimeTotal) },
    recurring: { lineCount: recurringCount, total: round2(recurringTotal) },
    isHybrid: oneTimeCount > 0 && recurringCount > 0,
  };
}

async function loadForRead(user: AuthUser, id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: DETAIL_SELECT,
  });

  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && order.salesRep.id !== user.sub) {
    throw new ForbiddenError("This order belongs to another sales rep");
  }

  return order;
}

type NumberingClient = {
  order: {
    findFirst: (args: {
      where: { orderNumber: { startsWith: string } };
      orderBy: { orderNumber: "desc" };
      select: { orderNumber: true };
    }) => Promise<{ orderNumber: string } | null>;
  };
};

/** `SO-2026-0001`, mirroring the quotation numbering. */
async function nextOrderNumber(client: NumberingClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;

  const latest = await client.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  const current = Number(latest?.orderNumber.slice(prefix.length) ?? 0);
  const next = (Number.isFinite(current) ? current : 0) + 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}
