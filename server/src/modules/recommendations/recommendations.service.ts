import { NotFoundError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import { RECOMMENDATION_ACTION } from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2 } from "../../common/utils/serialize.js";
import { resolvePricing } from "../catalog/pricing.service.js";
import { calculateRisk } from "../quotations/risk.service.js";
import * as quotations from "../quotations/quotations.service.js";
import type { AcceptInput } from "./recommendations.types.js";

/** How far a live promotion lifts a suggestion up the ranking. */
const PROMOTION_RANK_BOOST = 0.15;

/** Suggestions are priced at a single unit so the panel compares like for like. */
const PREVIEW_QUANTITY = 1;

const MAX_SUGGESTIONS = 8;

export type Suggestion = {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  suggestionType: string;
  /** Ranking strength, promotion boost included. */
  rank: number;
  score: number | null;
  /** Which cart lines triggered this suggestion. */
  becauseOf: string[];

  unitPrice: number;
  listPrice: number;
  revenueDelta: number;
  marginDelta: number | null;
  marginPercent: number | null;

  /** Where the order's margin and risk land if this is added. */
  orderMarginPercentAfter: number | null;
  orderMarginDeltaPercent: number | null;
  riskScoreAfter: number;
  riskScoreDelta: number;

  promotion: { id: string; name: string; discountValue: number } | null;
  minimumMarginPercent: number | null;
};

/**
 * Ranked upsell and cross-sell suggestions for the cart as it stands.
 *
 * Every candidate is run through the real pricing engine for this customer and
 * then through the risk engine with the candidate appended, so the panel can
 * show what actually happens to margin and to the approval requirement if the
 * rep accepts it — a healthy-margin upsell can pull a quote back under the
 * threshold, and that is worth showing rather than guessing at.
 */
export async function getSuggestions(
  user: AuthUser,
  quotationId: string,
): Promise<{ suggestions: Suggestion[]; baseline: { riskScore: number; marginPercent: number | null } }> {
  const quotation = await loadQuotation(user, quotationId);

  const inCart = new Set(quotation.lines.map((line) => line.productId));

  if (inCart.size === 0) {
    return { suggestions: [], baseline: { riskScore: 0, marginPercent: null } };
  }

  const dismissed = await dismissedProductIds(quotationId);

  const relationships = await prisma.productRelationship.findMany({
    where: {
      isActive: true,
      sourceProductId: { in: [...inCart] },
      targetProductId: { notIn: [...inCart] },
      targetProduct: { isActive: true },
    },
    select: {
      relationshipType: true,
      score: true,
      minimumMarginPercent: true,
      sourceProduct: { select: { id: true, sku: true } },
      targetProduct: { select: { id: true, sku: true, name: true } },
    },
  });

  const promotions = await activePromotions(
    relationships.map((relation) => relation.targetProduct.id),
  );

  // One product can be reachable from several cart lines; keep the strongest
  // pairing and remember every line that pointed at it.
  const best = new Map<string, (typeof relationships)[number] & { becauseOf: Set<string> }>();

  for (const relation of relationships) {
    const targetId = relation.targetProduct.id;

    if (dismissed.has(targetId)) {
      continue;
    }

    const existing = best.get(targetId);
    const promoted = promotions.has(targetId);
    const rank = rankOf(relation.score, promoted);

    if (!existing) {
      best.set(targetId, { ...relation, becauseOf: new Set([relation.sourceProduct.sku]) });
      continue;
    }

    existing.becauseOf.add(relation.sourceProduct.sku);

    if (rank > rankOf(existing.score, promoted)) {
      best.set(targetId, { ...relation, becauseOf: existing.becauseOf });
    }
  }

  const candidates = [...best.values()];

  if (candidates.length === 0) {
    return { suggestions: [], baseline: { riskScore: 0, marginPercent: null } };
  }

  // Price the cart and every candidate in one call, then reuse the priced cart
  // as the baseline each candidate is measured against.
  const cartLineCount = quotation.lines.length;

  const pricing = await resolvePricing({
    customerId: quotation.customerId,
    currencyCode: quotation.currencyCode,
    lines: [
      ...quotation.lines.map((line) => ({
        productId: line.productId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        quantity: Number(line.quantity),
        discountPercent: Number(line.discountPercent),
      })),
      ...candidates.map((candidate) => ({
        productId: candidate.targetProduct.id,
        quantity: PREVIEW_QUANTITY,
        discountPercent: 0,
      })),
    ],
  });

  const cartPriced = pricing.lines.slice(0, cartLineCount);
  const candidatePriced = pricing.lines.slice(cartLineCount);
  const baseline = calculateRisk(cartPriced);

  const suggestions = candidates
    .map((candidate, index) => {
      const priced = candidatePriced[index]!;
      const promotion = promotions.get(candidate.targetProduct.id) ?? null;

      // "Only healthy margin suggestions surface" — a pairing may set its own
      // floor, and a candidate that misses it is not shown at all.
      const floor = candidate.minimumMarginPercent
        ? Number(candidate.minimumMarginPercent)
        : null;

      if (
        floor !== null &&
        (priced.marginPercent === null || priced.marginPercent < floor)
      ) {
        return null;
      }

      const withCandidate = calculateRisk([...cartPriced, priced]);

      return {
        productId: candidate.targetProduct.id,
        sku: priced.sku,
        name: priced.name,
        categoryName: priced.categoryName,
        suggestionType: candidate.relationshipType,
        rank: rankOf(candidate.score, promotion !== null),
        score: candidate.score === null ? null : Number(candidate.score),
        becauseOf: [...candidate.becauseOf],

        unitPrice: priced.unitPrice,
        listPrice: priced.listPrice,
        revenueDelta: priced.lineTotal,
        marginDelta: priced.marginAmount,
        marginPercent: priced.marginPercent,

        orderMarginPercentAfter: withCandidate.marginPercent,
        orderMarginDeltaPercent:
          withCandidate.marginPercent === null || baseline.marginPercent === null
            ? null
            : round2(withCandidate.marginPercent - baseline.marginPercent),
        riskScoreAfter: withCandidate.score,
        riskScoreDelta: round2(withCandidate.score - baseline.score),

        promotion,
        minimumMarginPercent: floor,
      } satisfies Suggestion;
    })
    .filter((suggestion): suggestion is Suggestion => suggestion !== null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_SUGGESTIONS);

  await logShown(quotationId, suggestions);

  return {
    suggestions,
    baseline: { riskScore: baseline.score, marginPercent: baseline.marginPercent },
  };
}

/** Adds the suggestion to the quote and records that it converted. */
export async function acceptSuggestion(
  user: AuthUser,
  quotationId: string,
  productId: string,
  input: AcceptInput,
) {
  await loadQuotation(user, quotationId);

  const result = await quotations.addLine(user, quotationId, {
    productId,
    quantity: input.quantity,
    discountPercent: input.discountPercent,
  });

  await recordEvent(quotationId, productId, RECOMMENDATION_ACTION.ACCEPTED, {
    reason: "Accepted from the upsell panel",
  });

  return result;
}

export async function dismissSuggestion(
  user: AuthUser,
  quotationId: string,
  productId: string,
) {
  await loadQuotation(user, quotationId);

  await recordEvent(quotationId, productId, RECOMMENDATION_ACTION.DISMISSED, {
    reason: "Dismissed from the upsell panel",
  });

  return getSuggestions(user, quotationId);
}

/* ── helpers ──────────────────────────────────────── */

function rankOf(score: unknown, promoted: boolean): number {
  return round2((score === null ? 0 : Number(score)) + (promoted ? PROMOTION_RANK_BOOST : 0));
}

/** Promotions live now, keyed by the products they cover. */
async function activePromotions(productIds: string[]) {
  if (productIds.length === 0) {
    return new Map<string, { id: string; name: string; discountValue: number }>();
  }

  const now = new Date();

  const rows = await prisma.promotionProduct.findMany({
    where: {
      productId: { in: productIds },
      promotion: { isActive: true, startAt: { lte: now }, endAt: { gte: now } },
    },
    select: {
      productId: true,
      promotion: { select: { id: true, name: true, discountValue: true } },
    },
  });

  return new Map(
    rows.map((row) => [
      row.productId,
      {
        id: row.promotion.id,
        name: row.promotion.name,
        discountValue: Number(row.promotion.discountValue),
      },
    ]),
  );
}

/** A dismissal sticks for the life of the quotation. */
async function dismissedProductIds(quotationId: string): Promise<Set<string>> {
  const rows = await prisma.recommendationEvent.findMany({
    where: { quotationId, action: RECOMMENDATION_ACTION.DISMISSED },
    select: { productId: true },
  });

  return new Set(rows.map((row) => row.productId));
}

/**
 * Records that a suggestion was put in front of the rep, once per quotation and
 * product, so the accept rate in the analytics module is meaningful.
 */
async function logShown(quotationId: string, suggestions: Suggestion[]) {
  if (suggestions.length === 0) {
    return;
  }

  const alreadyLogged = await prisma.recommendationEvent.findMany({
    where: {
      quotationId,
      productId: { in: suggestions.map((suggestion) => suggestion.productId) },
    },
    select: { productId: true },
  });

  const seen = new Set(alreadyLogged.map((row) => row.productId));
  const fresh = suggestions.filter((suggestion) => !seen.has(suggestion.productId));

  if (fresh.length === 0) {
    return;
  }

  await prisma.recommendationEvent.createMany({
    data: fresh.map((suggestion) => ({
      quotationId,
      productId: suggestion.productId,
      suggestionType: suggestion.suggestionType,
      reason: `Paired with ${suggestion.becauseOf.join(", ")}`,
      marginDelta: suggestion.marginDelta,
      wasPromoted: suggestion.promotion !== null,
      action: RECOMMENDATION_ACTION.SHOWN,
    })),
  });
}

async function recordEvent(
  quotationId: string,
  productId: string,
  action: string,
  extra: { reason?: string } = {},
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new NotFoundError("Product not found");
  }

  await prisma.recommendationEvent.create({
    data: {
      quotationId,
      productId,
      suggestionType: "UPSELL_PANEL",
      reason: extra.reason ?? null,
      action,
    },
  });
}

async function loadQuotation(user: AuthUser, quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      customerId: true,
      currencyCode: true,
      salesRepId: true,
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

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && quotation.salesRepId !== user.sub) {
    throw new ForbiddenError("This quotation belongs to another sales rep");
  }

  return quotation;
}
