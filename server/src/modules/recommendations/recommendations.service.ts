import { NotFoundError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import { RECOMMENDATION_ACTION } from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2 } from "../../common/utils/serialize.js";
import { resolvePricing } from "../catalog/pricing.service.js";
import { calculateRisk } from "../quotations/risk.service.js";
import * as quotations from "../quotations/quotations.service.js";
import * as bandit from "./bandit.service.js";
import type { AcceptInput } from "./recommendations.types.js";

/** How far a live promotion lifts a suggestion up the ranking. */
const PROMOTION_RANK_BOOST = 0.15;

/** Suggestions are priced at a single unit so the panel compares like for like. */
const PREVIEW_QUANTITY = 1;

const MAX_SUGGESTIONS = 8;

export type SuggestionsResult = {
  suggestions: Suggestion[];
  baseline: { riskScore: number; marginPercent: number | null };
  /** How much the panel is the learned policy versus the catalogue heuristic. */
  policy: bandit.PolicyState;
};

export type Suggestion = {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  suggestionType: string;
  /** Catalogue pairing strength, promotion boost included. One input to the
   * ranking, not the ranking itself — see `policyScore`. */
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

  /** What the learned policy alone thinks of this candidate, 0-1. */
  policyScore: number;
  /** Probability it was put on the panel — the `p` the IPS update divides by. */
  probability: number;
  /** True when it is here because the policy explored, not because it ranked. */
  explored: boolean;
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
): Promise<SuggestionsResult> {
  const quotation = await loadQuotation(user, quotationId);

  // Suggestions the rep neither took nor dismissed are real feedback too, and
  // the policy has to see them or it only ever learns from the clicks.
  await settleOpenDecisions();

  const inCart = new Set(quotation.lines.map((line) => line.productId));

  if (inCart.size === 0) {
    return empty(await bandit.policyState());
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
    return empty(await bandit.policyState());
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

  const cartValue = cartPriced.reduce((sum, line) => sum + line.lineTotal, 0);
  const context: bandit.Context = {
    customerTier: pricing.customerTier?.name ?? "none",
    cartLines: cartLineCount,
    cartValue,
    orderMarginPercent: baseline.marginPercent,
    riskScore: baseline.score,
  };

  const eligible = candidates
    .map((candidate, index): Suggestion | null => {
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

        // Filled in below, once the policy has scored the whole slate.
        policyScore: 0,
        probability: 1,
        explored: false,
      } satisfies Suggestion;
    })
    .filter((suggestion): suggestion is Suggestion => suggestion !== null);

  if (eligible.length === 0) {
    return empty(await bandit.policyState());
  }

  const averageLineValue = cartLineCount === 0 ? 1 : cartValue / cartLineCount;

  const scored = await bandit.scoreActions(
    context,
    eligible.map((suggestion) => ({
      productId: suggestion.productId,
      categoryName: suggestion.categoryName,
      suggestionType: suggestion.suggestionType,
      relationshipScore: suggestion.score,
      promoted: suggestion.promotion !== null,
      marginPercent: suggestion.marginPercent,
      priceRatio: averageLineValue > 0 ? suggestion.revenueDelta / averageLineValue : 1,
      orderMarginDeltaPercent: suggestion.orderMarginDeltaPercent,
      riskScoreDelta: suggestion.riskScoreDelta,
    })),
  );

  const policy = await bandit.policyState();

  // Until the policy has seen enough feedback to be worth trusting, the panel
  // is still mostly the catalogue's own pairing scores. `trust` walks it over.
  const ranked = eligible.map((suggestion, index) => {
    const { score, features } = scored[index]!;
    const blended = (1 - policy.trust) * clamp01(suggestion.rank) + policy.trust * score;

    suggestion.policyScore = round2(score);

    return { item: suggestion, score: blended, features };
  });

  const chosen = bandit.exploreTopK(
    ranked,
    MAX_SUGGESTIONS,
    policy.epsilon,
    `${quotationId}:${policy.updates}`,
  );

  const suggestions = chosen.map(({ item, probability, explored }) => {
    item.probability = probability;
    item.explored = explored;

    return item;
  });

  const featuresByProduct = new Map(
    ranked.map((entry) => [entry.item.productId, entry.features]),
  );

  await logShown(quotationId, suggestions, featuresByProduct, policy.updates);

  return {
    suggestions,
    baseline: { riskScore: baseline.score, marginPercent: baseline.marginPercent },
    policy,
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

  // Reward the line as it was actually added, not as it was previewed — a rep
  // who discounted it to win the deal earned the policy less than a rep who
  // did not.
  const added = result.quotation.lines.find((line) => line.productId === productId);

  await learn(
    quotationId,
    productId,
    bandit.acceptCost(added?.marginPercent === null || added?.marginPercent === undefined
      ? null
      : Number(added.marginPercent)),
  );

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

  await learn(quotationId, productId, bandit.DISMISS);

  return getSuggestions(user, quotationId);
}

/* ── learning ─────────────────────────────────────── */

/** How long a suggestion sits unanswered before it counts as ignored. */
const SETTLE_AFTER_MINUTES = 30;

/**
 * Trains the policy on the decision record for this product, if one is still
 * open. The record carries the features and the probability from the moment it
 * was shown, so the update is against the panel the rep actually saw.
 */
async function learn(quotationId: string, productId: string, cost: number) {
  const decision = await prisma.recommendationEvent.findFirst({
    where: {
      quotationId,
      productId,
      action: RECOMMENDATION_ACTION.SHOWN,
      learnedAt: null,
      features: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (decision) {
    await bandit.learnFromEvent(decision.id, cost);
  }
}

/** How many stale decisions one panel load settles. */
const SETTLE_BATCH = 25;

/**
 * Anything shown long enough ago and never acted on is settled as ignored.
 * Without this the policy would only ever see accepts and dismissals, and would
 * read a panel everyone scrolled past as a panel nobody minded.
 *
 * The sweep is deliberately global rather than scoped to the quotation being
 * opened. Scoped, a quotation nobody ever reopens would never settle, so the
 * only panels teaching the policy would be the ones that drew a rep back — and
 * being ignored would quietly drop out of the training set it is most needed
 * in. There is no scheduler in this service to hang the work off, so panel
 * loads pay for it in bounded batches, oldest decisions first.
 */
async function settleOpenDecisions() {
  const cutoff = new Date(Date.now() - SETTLE_AFTER_MINUTES * 60_000);

  const stale = await prisma.recommendationEvent.findMany({
    where: {
      action: RECOMMENDATION_ACTION.SHOWN,
      learnedAt: null,
      createdAt: { lt: cutoff },
      features: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "asc" },
    take: SETTLE_BATCH,
    select: { id: true },
  });

  await bandit.learnFromEvents(
    stale.map((row) => row.id),
    bandit.IGNORED,
  );
}

/* ── helpers ──────────────────────────────────────── */

function empty(policy: bandit.PolicyState): SuggestionsResult {
  return {
    suggestions: [],
    baseline: { riskScore: 0, marginPercent: null },
    policy,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
 * Writes the decision record the policy will later learn from: which suggestion
 * was shown, on what features, with what probability.
 *
 * One open record per quotation and product — a panel that refreshes while the
 * rep works is the same decision, not a new one. Once that record has been
 * answered (taken, dismissed, or settled as ignored) the next show opens a
 * fresh one, because being shown again after being passed over really is a new
 * decision with a new outcome.
 */
async function logShown(
  quotationId: string,
  suggestions: Suggestion[],
  features: Map<string, bandit.FeatureVector>,
  modelUpdates: number,
) {
  if (suggestions.length === 0) {
    return;
  }

  const open = await prisma.recommendationEvent.findMany({
    where: {
      quotationId,
      productId: { in: suggestions.map((suggestion) => suggestion.productId) },
      action: RECOMMENDATION_ACTION.SHOWN,
      learnedAt: null,
      features: { not: Prisma.DbNull },
    },
    select: { productId: true },
  });

  const seen = new Set(open.map((row) => row.productId));
  const fresh = suggestions.filter(
    (suggestion) => !seen.has(suggestion.productId) && features.has(suggestion.productId),
  );

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
      probability: suggestion.probability,
      features: features.get(suggestion.productId)!,
      modelUpdates,
      wasExplored: suggestion.explored,
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
