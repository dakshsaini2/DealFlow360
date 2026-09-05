import type { PricedLine } from "../catalog/pricing.service.js";
import { round2 } from "../../common/utils/serialize.js";

/**
 * The margin an order is expected to hold. Falling below it contributes risk
 * even when every line is inside its discount ceiling.
 */
const TARGET_MARGIN_PERCENT = 25;

/**
 * Calibrated against the approval threshold (25) rather than picked by feel:
 *
 *   - 8  puts a systematic ~3 point overage across the whole order at the
 *        threshold, so a pattern of small violations trips approval
 *   - 3  puts a single line ~8 points over at the threshold, so one badly
 *        discounted item trips it on its own
 *   - 4  puts an order 6 points under the margin target at the threshold
 *
 * Change these together with the seeded `ApprovalPolicy` bands.
 */
const WEIGHTED_EXCESS_FACTOR = 8;
const MAX_EXCESS_FACTOR = 3;
const MARGIN_SHORTFALL_FACTOR = 4;

export type RiskBreakdown = {
  /** 0-100. What the approval policy bands are matched against. */
  score: number;
  discountRisk: number;
  marginRisk: number;
  /** Value-weighted average points over ceiling across the order. */
  weightedExcessPercent: number;
  /** Worst single line's points over its own ceiling. */
  maxExcessPercent: number;
  marginPercent: number | null;
  /** Lines that broke their own ceiling, worst first. */
  offendingLines: {
    sku: string;
    name: string;
    categoryName: string;
    discountPercent: number;
    maxDiscountPercent: number;
    excessPercent: number;
  }[];
  /** Human-readable reason, stored on the approval instance. */
  reason: string;
};

/**
 * The blended discount risk score.
 *
 * Every line is checked against *its own* ceiling rather than one limit for the
 * whole order, because categories carry different margins — so a service line
 * 8 points over its 10% limit is a problem even on a customer whose tier
 * allows 15% elsewhere.
 *
 * "Blended" means the score looks at the whole pattern, not just the worst
 * line: many lines each slightly over would otherwise slip through unnoticed
 * while quietly giving away a lot of margin. Two views are taken and the
 * harsher one wins:
 *
 *   - value-weighted average excess, which catches the spread-out case
 *   - the single worst line, which catches one badly discounted item
 *
 * Weighting by line value matters: 20 points over on a $50 accessory should
 * not outrank 5 points over on a $200k server order.
 *
 * Margin is a second, independent input. Without it a rep could discount every
 * line exactly to its ceiling, score zero risk, and auto-approve an order that
 * makes almost nothing — the ceiling bounds discretion, it does not guarantee a
 * healthy deal. The two are combined with `max` so neither can mask the other,
 * and both components are returned so an approver can see which one fired.
 */
export function calculateRisk(lines: PricedLine[]): RiskBreakdown {
  if (lines.length === 0) {
    return emptyRisk();
  }

  const netTotal = lines.reduce((sum, line) => sum + line.lineSubtotal, 0);

  // Fall back to an unweighted mean if the order nets to zero, so a fully
  // discounted quote still scores rather than dividing by zero.
  const weightedExcessPercent =
    netTotal > 0
      ? round2(
          lines.reduce(
            (sum, line) => sum + line.discountExcessPercent * line.lineSubtotal,
            0,
          ) / netTotal,
        )
      : round2(
          lines.reduce((sum, line) => sum + line.discountExcessPercent, 0) /
            lines.length,
        );

  const maxExcessPercent = round2(
    Math.max(...lines.map((line) => line.discountExcessPercent)),
  );

  const discountRisk = clamp(
    Math.max(
      weightedExcessPercent * WEIGHTED_EXCESS_FACTOR,
      maxExcessPercent * MAX_EXCESS_FACTOR,
    ),
  );

  const marginPercent = orderMarginPercent(lines, netTotal);
  const marginRisk =
    marginPercent === null
      ? 0
      : clamp((TARGET_MARGIN_PERCENT - marginPercent) * MARGIN_SHORTFALL_FACTOR);

  const offendingLines = lines
    .filter((line) => !line.withinCeiling)
    .sort((a, b) => b.discountExcessPercent - a.discountExcessPercent)
    .map((line) => ({
      sku: line.sku,
      name: line.name,
      categoryName: line.categoryName,
      discountPercent: line.discountPercent,
      maxDiscountPercent: line.maxDiscountPercent,
      excessPercent: line.discountExcessPercent,
    }));

  const score = clamp(Math.max(discountRisk, marginRisk));

  return {
    score,
    discountRisk,
    marginRisk,
    weightedExcessPercent,
    maxExcessPercent,
    marginPercent,
    offendingLines,
    reason: describe(score, discountRisk, marginRisk, offendingLines, marginPercent),
  };
}

function orderMarginPercent(lines: PricedLine[], netTotal: number): number | null {
  // A single line with unknown cost would overstate the order's margin, so the
  // whole order is treated as uncosted rather than reporting a wrong number.
  if (lines.some((line) => line.marginAmount === null) || netTotal <= 0) {
    return null;
  }

  const margin = lines.reduce((sum, line) => sum + (line.marginAmount ?? 0), 0);

  return round2((margin / netTotal) * 100);
}

function describe(
  score: number,
  discountRisk: number,
  marginRisk: number,
  offending: RiskBreakdown["offendingLines"],
  marginPercent: number | null,
): string {
  if (score === 0) {
    return "Every line is within its discount ceiling and the margin is healthy.";
  }

  const reasons: string[] = [];

  if (offending.length > 0) {
    const worst = offending[0]!;
    reasons.push(
      offending.length === 1
        ? `${worst.sku} is ${worst.excessPercent} points over its ${worst.maxDiscountPercent}% ceiling`
        : `${offending.length} lines are over their ceilings, worst ${worst.sku} by ${worst.excessPercent} points`,
    );
  }

  if (marginRisk > discountRisk && marginPercent !== null) {
    reasons.push(
      `order margin of ${marginPercent}% is below the ${TARGET_MARGIN_PERCENT}% target`,
    );
  } else if (marginRisk > 0 && marginPercent !== null) {
    reasons.push(`margin ${marginPercent}%`);
  }

  return reasons.join("; ") || "Discount exceeds policy.";
}

function emptyRisk(): RiskBreakdown {
  return {
    score: 0,
    discountRisk: 0,
    marginRisk: 0,
    weightedExcessPercent: 0,
    maxExcessPercent: 0,
    marginPercent: null,
    offendingLines: [],
    reason: "Empty quotation.",
  };
}

function clamp(value: number): number {
  return round2(Math.min(100, Math.max(0, value)));
}
