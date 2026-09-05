import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import {
  ALERT_SEVERITY,
  AUDIT_ACTION,
  ORDER_STATUS,
  QUOTATION_STATUS,
} from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";
import type { ActOnAlertInput, HealthQuery } from "./health.types.js";

/**
 * Deal health and anomaly detection (spec B9).
 *
 * The dashboard is computed on read rather than by a background job. That is a
 * deliberate trade: it costs a few queries per load, but it means the numbers a
 * manager sees are never stale, and there is no scheduler to run for the demo.
 * Each pass also *persists* what it found — `DealHealth` and `AnomalyAlert` —
 * so an alert someone has already acted on stays acted on between loads.
 */

/** Deals that are still live and therefore still capable of stalling. */
const OPEN_STATUSES: string[] = [
  QUOTATION_STATUS.DRAFT,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
];

export const ALERT_TYPE = {
  STALLED: "STALLED",
  DISCOUNT_ANOMALY: "DISCOUNT_ANOMALY",
  DELIVERY_SLIPPAGE: "DELIVERY_SLIPPAGE",
  MARGIN_EROSION: "MARGIN_EROSION",
} as const;

const HEALTH_STATUS = {
  HEALTHY: "HEALTHY",
  AT_RISK: "AT_RISK",
  CRITICAL: "CRITICAL",
} as const;

export async function getDashboard(user: AuthUser, query: HealthQuery) {
  const [stalledDays, anomalyMultiplier, riskThreshold] = await Promise.all([
    getNumericSetting("STALLED_DEAL_DAYS"),
    getNumericSetting("DISCOUNT_ANOMALY_MULTIPLIER"),
    getNumericSetting("APPROVAL_RISK_THRESHOLD"),
  ]);

  const scope = visibilityFilter(user, query.scope);

  const [stalled, discountAnomalies, slippage] = await Promise.all([
    findStalled(scope, stalledDays),
    findDiscountAnomalies(scope, anomalyMultiplier),
    findDeliverySlippage(scope),
  ]);

  // Persisting is what lets a nudge stick: an alert already raised keeps its
  // id, its status and whoever resolved it.
  await persistAlerts([...stalled, ...discountAnomalies, ...slippage]);
  await persistHealth(scope, stalledDays);

  const alerts = await prisma.anomalyAlert.findMany({
    where: {
      quotation: scope,
      ...(query.status ? { status: query.status } : { status: "OPEN" }),
      ...(query.alertType ? { alertType: query.alertType } : {}),
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      alertType: true,
      severity: true,
      title: true,
      description: true,
      thresholdValue: true,
      actualValue: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      resolver: { select: { id: true, firstName: true, lastName: true } },
      quotation: {
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          approvalStatus: true,
          grandTotal: true,
          currencyCode: true,
          blendedRiskScore: true,
          updatedAt: true,
          customer: { select: { id: true, name: true } },
          salesRep: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const health = await prisma.dealHealth.findMany({
    where: { quotation: { ...scope, status: { in: OPEN_STATUSES } } },
    orderBy: { healthScore: "asc" },
    take: 50,
    select: {
      id: true,
      healthScore: true,
      healthStatus: true,
      daysInactive: true,
      discountRiskScore: true,
      fulfillmentRiskScore: true,
      billingRiskScore: true,
      lastActivityAt: true,
      calculatedAt: true,
      quotation: {
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          grandTotal: true,
          currencyCode: true,
          customer: { select: { id: true, name: true } },
          salesRep: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  return {
    alerts: serialize(alerts),
    dealHealth: serialize(health),
    counts: {
      stalled: stalled.length,
      discountAnomalies: discountAnomalies.length,
      deliverySlippage: slippage.length,
      atRisk: health.filter((row) => row.healthStatus !== HEALTH_STATUS.HEALTHY).length,
    },
    thresholds: {
      stalledDays,
      anomalyMultiplier,
      riskThreshold,
    },
  };
}

/**
 * The action a manager takes from an alert. A nudge is a note to the rep; an
 * escalation hands the deal to the manager. Both are recorded, and both close
 * the alert — an alert nobody acted on is the only kind worth still showing.
 */
export async function actOnAlert(
  user: AuthUser,
  alertId: string,
  input: ActOnAlertInput,
) {
  const alert = await prisma.anomalyAlert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      status: true,
      title: true,
      alertType: true,
      quotationId: true,
      quotation: { select: { id: true, quoteNumber: true, salesRepId: true } },
    },
  });

  if (!alert) {
    throw new NotFoundError("Alert not found");
  }

  if (alert.status !== "OPEN") {
    throw new ValidationError("This alert has already been actioned", [
      `status: alert is ${alert.status}`,
    ]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.anomalyAlert.update({
      where: { id: alertId },
      data: {
        status: input.action === "DISMISS" ? "DISMISSED" : "RESOLVED",
        resolvedAt: new Date(),
        resolvedBy: user.sub,
      },
    });

    // A nudge or escalation is a message the rep will actually see, so it goes
    // on the quotation thread rather than into a notifications table nothing
    // reads.
    if (input.action !== "DISMISS") {
      await tx.lineComment.create({
        data: {
          quotationId: alert.quotationId,
          userId: user.sub,
          comment:
            input.action === "ESCALATE"
              ? `Escalated: ${alert.title}. ${input.note ?? ""}`.trim()
              : `Nudge: ${alert.title}. ${input.note ?? ""}`.trim(),
        },
      });
    }
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "AnomalyAlert",
    entityId: alertId,
    oldValues: { status: alert.status },
    newValues: { status: input.action, quoteNumber: alert.quotation.quoteNumber },
    reason: input.note,
  });

  return { alertId, action: input.action, quotationId: alert.quotationId };
}

/* ── detectors ────────────────────────────────────── */

type DetectedAlert = {
  quotationId: string;
  alertType: string;
  severity: string;
  title: string;
  description: string;
  thresholdValue: number | null;
  actualValue: number | null;
};

/** A live deal nobody has touched for longer than the configured window. */
async function findStalled(
  scope: Record<string, unknown>,
  stalledDays: number,
): Promise<DetectedAlert[]> {
  const cutoff = new Date(Date.now() - stalledDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.quotation.findMany({
    where: { ...scope, status: { in: OPEN_STATUSES }, updatedAt: { lt: cutoff } },
    select: {
      id: true,
      quoteNumber: true,
      updatedAt: true,
      grandTotal: true,
      customer: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    const days = daysSince(row.updatedAt);

    return {
      quotationId: row.id,
      alertType: ALERT_TYPE.STALLED,
      // The longer it sits, the worse it is — a quote untouched for four times
      // the window is a different problem from one a day over.
      severity:
        days > stalledDays * 3
          ? ALERT_SEVERITY.HIGH
          : days > stalledDays * 2
            ? ALERT_SEVERITY.MEDIUM
            : ALERT_SEVERITY.LOW,
      title: `${row.quoteNumber} has been quiet for ${days} days`,
      description: `No activity on ${row.customer.name}'s ${Number(row.grandTotal).toFixed(2)} deal since ${row.updatedAt.toISOString().slice(0, 10)}. The configured limit is ${stalledDays} days.`,
      thresholdValue: stalledDays,
      actualValue: days,
    };
  });
}

/**
 * A discount well above what this rep normally gives.
 *
 * The comparison is against the rep's *own* history, not a company average,
 * because reps sell different books — a cloud rep discounting 30% is ordinary
 * where a hardware rep doing the same is not. A rep with too little history to
 * judge is skipped rather than flagged on noise.
 */
async function findDiscountAnomalies(
  scope: Record<string, unknown>,
  multiplier: number,
): Promise<DetectedAlert[]> {
  const MIN_HISTORY = 3;

  const rows = await prisma.quotation.findMany({
    where: { ...scope, status: { not: QUOTATION_STATUS.CANCELLED } },
    select: {
      id: true,
      quoteNumber: true,
      salesRepId: true,
      status: true,
      subtotal: true,
      discountTotal: true,
      createdAt: true,
      customer: { select: { name: true } },
      salesRep: { select: { firstName: true, lastName: true } },
    },
  });

  const effectiveDiscount = (row: (typeof rows)[number]) => {
    const subtotal = Number(row.subtotal);

    return subtotal > 0 ? (Number(row.discountTotal) / subtotal) * 100 : 0;
  };

  // Each rep's baseline, from every quote they have written.
  const byRep = new Map<string, number[]>();

  for (const row of rows) {
    const bucket = byRep.get(row.salesRepId) ?? [];

    bucket.push(effectiveDiscount(row));
    byRep.set(row.salesRepId, bucket);
  }

  const alerts: DetectedAlert[] = [];

  for (const row of rows) {
    if (!OPEN_STATUSES.includes(row.status)) {
      continue;
    }

    const history = byRep.get(row.salesRepId) ?? [];

    if (history.length < MIN_HISTORY) {
      continue;
    }

    const average = history.reduce((total, value) => total + value, 0) / history.length;
    const actual = effectiveDiscount(row);
    const limit = average * multiplier;

    // A rep who normally gives nothing would otherwise be flagged for any
    // discount at all, so there is a floor below which nothing is anomalous.
    if (average < 1 || actual <= limit) {
      continue;
    }

    alerts.push({
      quotationId: row.id,
      alertType: ALERT_TYPE.DISCOUNT_ANOMALY,
      severity:
        actual > limit * 1.5 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
      title: `${row.quoteNumber} is discounted ${actual.toFixed(1)}% — well above ${row.salesRep.firstName}'s usual`,
      description: `${row.salesRep.firstName} ${row.salesRep.lastName} averages ${average.toFixed(1)}% across ${history.length} quotes. This one is at ${actual.toFixed(1)}%, past the ${multiplier}× line of ${limit.toFixed(1)}%.`,
      thresholdValue: round2(limit),
      actualValue: round2(actual),
    });
  }

  return alerts;
}

/** An order past the date it was promised on, still not delivered. */
async function findDeliverySlippage(
  scope: Record<string, unknown>,
): Promise<DetectedAlert[]> {
  const salesRepId = "salesRepId" in scope ? scope.salesRepId : undefined;

  const rows = await prisma.order.findMany({
    where: {
      ...(salesRepId ? { salesRepId: salesRepId as string } : {}),
      promisedDeliveryDate: { lt: new Date() },
      status: { notIn: [ORDER_STATUS.FULFILLED, ORDER_STATUS.CANCELLED] },
      quotationId: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      quotationId: true,
      promisedDeliveryDate: true,
      status: true,
      customer: { select: { name: true } },
    },
  });

  return rows.flatMap((row) => {
    if (!row.quotationId || !row.promisedDeliveryDate) {
      return [];
    }

    const late = daysSince(row.promisedDeliveryDate);

    return [
      {
        quotationId: row.quotationId,
        alertType: ALERT_TYPE.DELIVERY_SLIPPAGE,
        severity: late > 14 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
        title: `${row.orderNumber} is ${late} days past its promised date`,
        description: `${row.customer.name} was promised delivery on ${row.promisedDeliveryDate.toISOString().slice(0, 10)}; the order is still ${row.status.toLowerCase()}.`,
        thresholdValue: 0,
        actualValue: late,
      },
    ];
  });
}

/* ── persistence ──────────────────────────────────── */

/**
 * Writes newly detected alerts, leaving existing ones alone.
 *
 * An alert is identified by its quotation and type rather than by its text, so
 * a stalled deal that gets staler does not sprout a second alert — and one a
 * manager has already dismissed does not come back on the next page load.
 */
async function persistAlerts(detected: DetectedAlert[]) {
  if (detected.length === 0) {
    return;
  }

  const existing = await prisma.anomalyAlert.findMany({
    where: {
      quotationId: { in: [...new Set(detected.map((alert) => alert.quotationId))] },
    },
    select: { id: true, quotationId: true, alertType: true, status: true },
  });

  const seen = new Set(
    existing.map((alert) => `${alert.quotationId}:${alert.alertType}`),
  );

  const fresh = detected.filter(
    (alert) => !seen.has(`${alert.quotationId}:${alert.alertType}`),
  );

  if (fresh.length > 0) {
    await prisma.anomalyAlert.createMany({ data: fresh });
  }

  // An open alert's severity and wording should keep up as the deal ages.
  for (const alert of detected) {
    const match = existing.find(
      (row) =>
        row.quotationId === alert.quotationId &&
        row.alertType === alert.alertType &&
        row.status === "OPEN",
    );

    if (match) {
      await prisma.anomalyAlert.update({
        where: { id: match.id },
        data: {
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          actualValue: alert.actualValue,
        },
      });
    }
  }
}

/**
 * The per-deal health score: 100 is a clean deal, and each risk dimension eats
 * into it. Keeping the three components separate — discount, fulfillment,
 * billing — is what lets the dashboard say *why* a deal is unhealthy rather
 * than only that it is.
 */
async function persistHealth(scope: Record<string, unknown>, stalledDays: number) {
  const quotations = await prisma.quotation.findMany({
    where: { ...scope, status: { in: OPEN_STATUSES } },
    select: {
      id: true,
      updatedAt: true,
      blendedRiskScore: true,
      orders: {
        select: {
          status: true,
          promisedDeliveryDate: true,
          invoices: { select: { status: true, amountDue: true, dueAt: true } },
        },
      },
    },
  });

  for (const quotation of quotations) {
    const daysInactive = daysSince(quotation.updatedAt);

    // The blended risk score is already a calibrated 0-100 figure, so it is
    // used as-is. Rescaling it against the approval threshold pinned every
    // over-threshold deal to 100 and made the health score unable to tell a
    // marginal breach from a severe one.
    const discountRisk = Math.min(100, Number(quotation.blendedRiskScore ?? 0));

    const order = quotation.orders[0];
    const fulfillmentRisk =
      order?.promisedDeliveryDate &&
      order.promisedDeliveryDate < new Date() &&
      order.status !== ORDER_STATUS.FULFILLED
        ? Math.min(100, daysSince(order.promisedDeliveryDate) * 5)
        : 0;

    const overdueInvoices =
      order?.invoices.filter(
        (invoice) =>
          Number(invoice.amountDue) > 0 && invoice.dueAt && invoice.dueAt < new Date(),
      ) ?? [];
    const billingRisk = Math.min(100, overdueInvoices.length * 40);

    // Inactivity is its own drag, scaled so a deal at the stall limit has lost
    // a quarter of its health to silence alone.
    const stallPenalty = Math.min(50, (daysInactive / Math.max(1, stalledDays)) * 25);

    const healthScore = round2(
      Math.max(
        0,
        100 - stallPenalty - discountRisk * 0.4 - fulfillmentRisk * 0.3 - billingRisk * 0.3,
      ),
    );

    const healthStatus =
      healthScore < 40
        ? HEALTH_STATUS.CRITICAL
        : healthScore < 70
          ? HEALTH_STATUS.AT_RISK
          : HEALTH_STATUS.HEALTHY;

    await prisma.dealHealth.upsert({
      where: { quotationId: quotation.id },
      update: {
        healthScore,
        healthStatus,
        daysInactive,
        discountRiskScore: round2(discountRisk),
        fulfillmentRiskScore: round2(fulfillmentRisk),
        billingRiskScore: round2(billingRisk),
        lastActivityAt: quotation.updatedAt,
        calculatedAt: new Date(),
      },
      create: {
        quotationId: quotation.id,
        healthScore,
        healthStatus,
        daysInactive,
        discountRiskScore: round2(discountRisk),
        fulfillmentRiskScore: round2(fulfillmentRisk),
        billingRiskScore: round2(billingRisk),
        lastActivityAt: quotation.updatedAt,
      },
    });
  }
}

/* ── helpers ──────────────────────────────────────── */

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function visibilityFilter(user: AuthUser, scope: "all" | "mine") {
  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  return orgWide && scope === "all" ? {} : { salesRepId: user.sub };
}
