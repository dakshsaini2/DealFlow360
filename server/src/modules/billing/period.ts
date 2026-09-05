/**
 * Billing period arithmetic, kept apart from persistence so the proration maths
 * can be reasoned about — and corrected — on its own.
 *
 * A plan is an interval (`MONTH` / `YEAR` / `WEEK` / `DAY`) times a count, so
 * "Quarterly" is three months rather than a separate concept.
 */

export type Interval = { billingInterval: string; intervalCount: number };

/** Advances `from` by one whole billing period. */
export function addPeriod(from: Date, plan: Interval): Date {
  const next = new Date(from.getTime());
  const count = Math.max(1, plan.intervalCount);

  switch (plan.billingInterval.toUpperCase()) {
    case "DAY":
      next.setUTCDate(next.getUTCDate() + count);
      break;
    case "WEEK":
      next.setUTCDate(next.getUTCDate() + 7 * count);
      break;
    case "YEAR":
      next.setUTCFullYear(next.getUTCFullYear() + count);
      break;
    case "MONTH":
    default: {
      // Clamp the day so 31 Jan + 1 month lands on 28/29 Feb rather than
      // rolling forward into March, which would silently shorten the period.
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + count);
      next.setUTCDate(Math.min(day, daysInMonth(next.getUTCFullYear(), next.getUTCMonth())));
      break;
    }
  }

  return next;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function periodDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

/**
 * The share of a period still to run at `effectiveAt`, between 0 and 1.
 *
 * This is what makes a mid-cycle change fair in both directions: the customer
 * is credited for the part of the old subscription they will not use and
 * charged only for the part of the new one they will.
 */
export function unusedFraction(
  periodStart: Date,
  periodEnd: Date,
  effectiveAt: Date,
): number {
  const total = periodEnd.getTime() - periodStart.getTime();

  if (total <= 0) {
    return 0;
  }

  const remaining = periodEnd.getTime() - effectiveAt.getTime();

  return Math.min(1, Math.max(0, remaining / total));
}

/** The recurring charge for one full period at these terms. */
export function periodAmount(
  quantity: number,
  unitPrice: number,
  discountPercent: number,
): number {
  const gross = quantity * unitPrice;

  return gross - gross * (discountPercent / 100);
}
