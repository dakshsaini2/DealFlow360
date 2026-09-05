import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  AUDIT_ACTION,
  BILLING_SCHEDULE_STATUS,
  LINE_TYPE,
  PRORATION_EVENT_TYPE,
  SUBSCRIPTION_STATUS,
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
import { addPeriod, periodAmount, unusedFraction } from "./period.js";
import type {
  CancelSubscriptionInput,
  ChangeQuantityInput,
  ListSubscriptionsQuery,
} from "./billing.types.js";

/** The client Prisma hands an interactive transaction. */
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const LINE_SELECT = {
  id: true,
  orderLineId: true,
  productId: true,
  subscriptionPlanId: true,
  quantity: true,
  unitPrice: true,
  discountPercent: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  status: true,
  product: { select: { id: true, sku: true, name: true, unit: true, taxRate: true } },
  subscriptionPlan: {
    select: {
      id: true,
      name: true,
      billingInterval: true,
      intervalCount: true,
      prorationEnabled: true,
      cancellationPolicy: true,
      refundPolicy: true,
    },
  },
  billingSchedules: {
    orderBy: { billingDate: "asc" as const },
    select: {
      id: true,
      billingDate: true,
      periodStart: true,
      periodEnd: true,
      quantity: true,
      amount: true,
      prorationAmount: true,
      status: true,
      invoiceId: true,
    },
  },
} as const;

const DETAIL_SELECT = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  nextBillingDate: true,
  currencyCode: true,
  createdAt: true,
  customer: { select: { id: true, name: true, customerCode: true } },
  order: {
    select: { id: true, orderNumber: true, salesRepId: true, status: true },
  },
  lines: { orderBy: { createdAt: "asc" as const }, select: LINE_SELECT },
  prorationEvents: {
    orderBy: { effectiveAt: "desc" as const },
    select: {
      id: true,
      subscriptionLineId: true,
      eventType: true,
      oldQuantity: true,
      newQuantity: true,
      effectiveAt: true,
      unusedPeriodAmount: true,
      newPeriodAmount: true,
      prorationAmount: true,
      reason: true,
      createdAt: true,
    },
  },
} as const;

/**
 * Turns the recurring lines of a freshly confirmed order into a live
 * subscription with a forward billing plan.
 *
 * Called from order confirmation so the schedule exists the moment the deal
 * closes — the spec's "recurring lines generate a billing schedule alongside
 * any one-time invoice". An order with no recurring lines produces nothing,
 * which is why this is safe to call unconditionally.
 */
export async function activateSubscriptionForOrder(
  tx: TransactionClient,
  orderId: string,
  horizon: number,
): Promise<string | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      currencyCode: true,
      confirmedAt: true,
      lines: {
        where: { lineType: LINE_TYPE.RECURRING },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          subscriptionPlanId: true,
          quantity: true,
          unitPrice: true,
          discountPercent: true,
          subscriptionPlan: {
            select: { id: true, billingInterval: true, intervalCount: true },
          },
        },
      },
    },
  });

  if (!order || order.lines.length === 0) {
    return null;
  }

  const startDate = order.confirmedAt ?? new Date();

  // Every line on one order shares a subscription, so the customer gets one
  // renewal conversation rather than one per product.
  const subscription = await tx.subscription.create({
    data: {
      customerId: order.customerId,
      orderId: order.id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      startDate,
      nextBillingDate: startDate,
      currencyCode: order.currencyCode,
    },
    select: { id: true },
  });

  let earliestNextBilling: Date | null = null;

  for (const line of order.lines) {
    const plan = line.subscriptionPlan;

    if (!plan || !line.subscriptionPlanId) {
      continue;
    }

    const periodEnd = addPeriod(startDate, plan);

    const subscriptionLine = await tx.subscriptionLine.create({
      data: {
        subscriptionId: subscription.id,
        orderLineId: line.id,
        productId: line.productId,
        subscriptionPlanId: line.subscriptionPlanId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        currentPeriodStart: startDate,
        currentPeriodEnd: periodEnd,
        status: SUBSCRIPTION_STATUS.ACTIVE,
      },
      select: { id: true },
    });

    await scheduleAhead(tx, {
      subscriptionLineId: subscriptionLine.id,
      from: startDate,
      plan,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountPercent: Number(line.discountPercent),
      periods: horizon,
    });

    if (!earliestNextBilling || periodEnd < earliestNextBilling) {
      earliestNextBilling = periodEnd;
    }
  }

  if (earliestNextBilling) {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { nextBillingDate: earliestNextBilling },
    });
  }

  return subscription.id;
}

export async function listSubscriptions(
  user: AuthUser,
  query: ListSubscriptionsQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const where = {
    ...visibilityFilter(user, query.scope),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { nextBillingDate: "asc" },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        nextBillingDate: true,
        currencyCode: true,
        customer: { select: { id: true, name: true, customerCode: true } },
        order: { select: { id: true, orderNumber: true } },
        lines: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            discountPercent: true,
            status: true,
            product: { select: { sku: true, name: true } },
            subscriptionPlan: { select: { name: true } },
          },
        },
      },
    }),
    prisma.subscription.count({ where }),
  ]);

  return paginated(
    rows.map((row) => ({
      ...serialize(row),
      // What the customer is billed each period at today's terms.
      recurringTotal: round2(
        row.lines
          .filter((line) => line.status === SUBSCRIPTION_STATUS.ACTIVE)
          .reduce(
            (total, line) =>
              total +
              periodAmount(
                Number(line.quantity),
                Number(line.unitPrice),
                Number(line.discountPercent),
              ),
            0,
          ),
      ),
    })),
    total,
    page,
  );
}

export async function getSubscription(user: AuthUser, id: string) {
  const subscription = await loadForRead(user, id);

  return {
    subscription: serialize(subscription),
    recurringTotal: round2(
      subscription.lines
        .filter((line) => line.status === SUBSCRIPTION_STATUS.ACTIVE)
        .reduce(
          (total, line) =>
            total +
            periodAmount(
              Number(line.quantity),
              Number(line.unitPrice),
              Number(line.discountPercent),
            ),
          0,
        ),
    ),
  };
}

/** The subscription raised from one order, if it has recurring lines. */
export async function getSubscriptionForOrder(user: AuthUser, orderId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { orderId },
    select: { id: true },
  });

  return subscription ? getSubscription(user, subscription.id) : null;
}

/**
 * Mid-cycle quantity change.
 *
 * The customer keeps the period they already paid for, so the change is priced
 * as the difference between what the rest of that period would have cost at the
 * old quantity and what it costs at the new one. A positive proration is an
 * extra charge, a negative one a credit — and every future scheduled period is
 * rewritten at the new quantity.
 */
export async function changeQuantity(
  user: AuthUser,
  subscriptionId: string,
  lineId: string,
  input: ChangeQuantityInput,
) {
  const subscription = await loadForRead(user, subscriptionId);
  const line = subscription.lines.find((entry) => entry.id === lineId);

  if (!line) {
    throw new NotFoundError("Subscription line not found");
  }

  if (line.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ValidationError("This subscription line is not active", [
      `status: line is ${line.status}`,
    ]);
  }

  const oldQuantity = Number(line.quantity);

  if (input.quantity === oldQuantity) {
    throw new ValidationError("The quantity is already set to that value", [
      "quantity: no change",
    ]);
  }

  const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : new Date();
  const periodStart = line.currentPeriodStart;
  const periodEnd = line.currentPeriodEnd;
  const unitPrice = Number(line.unitPrice);
  const discountPercent = Number(line.discountPercent);
  const horizon = await getNumericSetting("BILLING_SCHEDULE_HORIZON");

  const remaining = line.subscriptionPlan.prorationEnabled
    ? unusedFraction(periodStart, periodEnd, effectiveAt)
    : 0;

  const unusedPeriodAmount = round2(
    periodAmount(oldQuantity, unitPrice, discountPercent) * remaining,
  );
  const newPeriodAmount = round2(
    periodAmount(input.quantity, unitPrice, discountPercent) * remaining,
  );
  const prorationAmount = round2(newPeriodAmount - unusedPeriodAmount);

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionLine.update({
      where: { id: lineId },
      data: { quantity: input.quantity },
    });

    await tx.prorationEvent.create({
      data: {
        subscriptionId,
        subscriptionLineId: lineId,
        eventType: PRORATION_EVENT_TYPE.QUANTITY_CHANGE,
        oldQuantity,
        newQuantity: input.quantity,
        effectiveAt,
        unusedPeriodAmount,
        newPeriodAmount,
        prorationAmount,
        reason: input.reason ?? null,
      },
    });

    // Anything already invoiced is history; only periods still ahead of the
    // customer are repriced.
    await tx.billingSchedule.deleteMany({
      where: {
        subscriptionLineId: lineId,
        status: BILLING_SCHEDULE_STATUS.SCHEDULED,
      },
    });

    await scheduleAhead(tx, {
      subscriptionLineId: lineId,
      from: periodEnd,
      plan: line.subscriptionPlan,
      quantity: input.quantity,
      unitPrice,
      discountPercent,
      periods: horizon,
    });

    // The proration itself rides on the next invoice rather than becoming its
    // own bill, which is how a mid-cycle change usually reaches a customer.
    if (prorationAmount !== 0) {
      const next = await tx.billingSchedule.findFirst({
        where: {
          subscriptionLineId: lineId,
          status: BILLING_SCHEDULE_STATUS.SCHEDULED,
        },
        orderBy: { billingDate: "asc" },
        select: { id: true, amount: true },
      });

      if (next) {
        await tx.billingSchedule.update({
          where: { id: next.id },
          data: { prorationAmount },
        });
      }
    }
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "SubscriptionLine",
    entityId: lineId,
    oldValues: { quantity: oldQuantity },
    newValues: { quantity: input.quantity, prorationAmount },
    reason: input.reason ?? "Mid-cycle quantity change",
  });

  return getSubscription(user, subscriptionId);
}

/**
 * Cancels a whole subscription or one line of it.
 *
 * The unused part of the paid period is computed here and returned as
 * `refundDue`; turning that into an actual credit note needs an invoice to
 * credit, which is the billing module's job.
 */
export async function cancelSubscription(
  user: AuthUser,
  subscriptionId: string,
  input: CancelSubscriptionInput,
) {
  const subscription = await loadForRead(user, subscriptionId);

  const targets = input.subscriptionLineId
    ? subscription.lines.filter((line) => line.id === input.subscriptionLineId)
    : subscription.lines;

  if (targets.length === 0) {
    throw new NotFoundError("Subscription line not found");
  }

  const active = targets.filter((line) => line.status === SUBSCRIPTION_STATUS.ACTIVE);

  if (active.length === 0) {
    throw new ValidationError("Nothing on this subscription is still active", [
      "status: already cancelled",
    ]);
  }

  const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : new Date();

  // `atPeriodEnd` is the usual contractual behaviour: service runs to the end
  // of the period already paid for, so nothing is refunded. An immediate
  // cancellation gives the unused part back.
  //
  // Unlike a quantity change — whose proration rides on the next invoice and is
  // taxed there — a cancellation credit is issued directly against an invoice
  // the customer has already paid. It therefore has to carry tax itself, or the
  // refund comes up short by exactly the tax the customer was charged.
  let refundDue = 0;

  await prisma.$transaction(async (tx) => {
    for (const line of active) {
      const remaining = input.atPeriodEnd
        ? 0
        : line.subscriptionPlan.prorationEnabled
          ? unusedFraction(line.currentPeriodStart, line.currentPeriodEnd, effectiveAt)
          : 0;

      const unusedPeriodAmount = round2(
        periodAmount(
          Number(line.quantity),
          Number(line.unitPrice),
          Number(line.discountPercent),
        ) * remaining,
      );

      refundDue += round2(
        unusedPeriodAmount * (1 + Number(line.product.taxRate) / 100),
      );

      await tx.subscriptionLine.update({
        where: { id: line.id },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED },
      });

      await tx.prorationEvent.create({
        data: {
          subscriptionId,
          subscriptionLineId: line.id,
          eventType: PRORATION_EVENT_TYPE.CANCELLATION,
          oldQuantity: line.quantity,
          newQuantity: 0,
          effectiveAt,
          unusedPeriodAmount,
          newPeriodAmount: 0,
          // A refund is money leaving, so it is recorded as a negative
          // adjustment for consistency with the quantity-change sign.
          prorationAmount: round2(-unusedPeriodAmount),
          reason: input.reason,
        },
      });

      // Nothing further is billed on a cancelled line.
      await tx.billingSchedule.updateMany({
        where: {
          subscriptionLineId: line.id,
          status: BILLING_SCHEDULE_STATUS.SCHEDULED,
        },
        data: { status: BILLING_SCHEDULE_STATUS.CANCELLED },
      });
    }

    const remainingActive = await tx.subscriptionLine.count({
      where: { subscriptionId, status: SUBSCRIPTION_STATUS.ACTIVE },
    });

    if (remainingActive === 0) {
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SUBSCRIPTION_STATUS.CANCELLED,
          endDate: input.atPeriodEnd
            ? (active[0]?.currentPeriodEnd ?? effectiveAt)
            : effectiveAt,
        },
      });
    }
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.STATUS_CHANGE,
    entityType: "Subscription",
    entityId: subscriptionId,
    oldValues: { status: subscription.status },
    newValues: {
      cancelledLines: active.length,
      atPeriodEnd: input.atPeriodEnd,
      refundDue: round2(refundDue),
    },
    reason: input.reason,
  });

  const result = await getSubscription(user, subscriptionId);

  return {
    ...result,
    /** The unused period value; the billing module turns this into a credit note. */
    refundDue: round2(refundDue),
  };
}

/* ── helpers ──────────────────────────────────────── */

/**
 * Writes `periods` upcoming rows onto a line's forward plan. Each period is
 * billed at its start, which is what makes the next invoice predictable.
 */
async function scheduleAhead(
  tx: TransactionClient,
  options: {
    subscriptionLineId: string;
    from: Date;
    plan: { billingInterval: string; intervalCount: number };
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    periods: number;
  },
) {
  const amount = round2(
    periodAmount(options.quantity, options.unitPrice, options.discountPercent),
  );

  let periodStart = options.from;

  for (let index = 0; index < Math.max(1, Math.floor(options.periods)); index += 1) {
    const periodEnd = addPeriod(periodStart, options.plan);

    await tx.billingSchedule.create({
      data: {
        subscriptionLineId: options.subscriptionLineId,
        billingDate: periodStart,
        periodStart,
        periodEnd,
        quantity: options.quantity,
        amount,
        status: BILLING_SCHEDULE_STATUS.SCHEDULED,
      },
    });

    periodStart = periodEnd;
  }
}

function visibilityFilter(user: AuthUser, scope: "all" | "mine") {
  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  return orgWide && scope === "all" ? {} : { order: { salesRepId: user.sub } };
}

async function loadForRead(user: AuthUser, id: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: DETAIL_SELECT,
  });

  if (!subscription) {
    throw new NotFoundError("Subscription not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && subscription.order.salesRepId !== user.sub) {
    throw new ForbiddenError("This subscription belongs to another sales rep");
  }

  return subscription;
}
