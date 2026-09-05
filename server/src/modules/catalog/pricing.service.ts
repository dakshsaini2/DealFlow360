import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2 } from "../../common/utils/serialize.js";
import type { ResolvePriceInput, ResolvePriceLine } from "./catalog.types.js";

/**
 * Where a resolved unit price came from. Surfaced to the client so a rep can
 * see whether the customer is on tier pricing or paying list.
 */
export const PRICE_SOURCE = {
  PRICE_LIST: "PRICE_LIST",
  BASE_PRICE: "BASE_PRICE",
} as const;

/**
 * Which rule set the line's discount ceiling, most specific first. A
 * category-specific rule beats the tier-wide rule, which beats the tier's own
 * default ceiling — this is what makes "hardware may go to 15% but services
 * only to 10%" work inside a single quote.
 */
export const CEILING_SOURCE = {
  CATEGORY_RULE: "CATEGORY_RULE",
  TIER_RULE: "TIER_RULE",
  TIER_DEFAULT: "TIER_DEFAULT",
  NONE: "NONE",
} as const;

export type PricedLine = {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  quantity: number;

  /** Catalog price before any tier pricing, including variant uplift. */
  listPrice: number;
  /** What this customer actually pays per unit before discount. */
  unitPrice: number;
  priceSource: (typeof PRICE_SOURCE)[keyof typeof PRICE_SOURCE];
  priceListId: string | null;
  priceListName: string | null;

  costPrice: number | null;
  taxPercent: number;

  /** The most the rep may discount this line without approval risk. */
  maxDiscountPercent: number;
  ceilingSource: (typeof CEILING_SOURCE)[keyof typeof CEILING_SOURCE];

  discountPercent: number;
  discountAmount: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;

  marginAmount: number | null;
  marginPercent: number | null;

  /** Points over this line's own ceiling; 0 when within it. */
  discountExcessPercent: number;
  withinCeiling: boolean;
  /** Unit price if the rep discounted exactly to the ceiling. */
  ceilingUnitPrice: number;
  /** Margin still left at that ceiling — the floor the ceiling protects. */
  marginPercentAtCeiling: number | null;
};

export type PricingResult = {
  currencyCode: string;
  customerTier: { id: string; name: string; defaultDiscountCeiling: number | null } | null;
  priceList: { id: string; name: string } | null;
  lines: PricedLine[];
  totals: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
    marginAmount: number | null;
    marginPercent: number | null;
  };
};

/**
 * Resolves what a specific customer pays for a set of lines, and how much room
 * the rep has to discount each one. This is the single place pricing is
 * decided — the quote builder, the upsell panel and the approval engine all
 * read their numbers from here so they can never disagree.
 */
export async function resolvePricing(
  input: ResolvePriceInput,
): Promise<PricingResult> {
  const tier = await resolveTier(input);

  const priceList = tier
    ? await findActivePriceList(tier.id, input.currencyCode)
    : null;

  const products = await loadProducts(input.lines);
  const ceilings = await loadDiscountRules(tier?.id ?? null);

  const lines = await Promise.all(
    input.lines.map((line) =>
      priceLine(line, {
        product: products.get(line.productId)!,
        priceListId: priceList?.id ?? null,
        priceListName: priceList?.name ?? null,
        ceilings,
        tierDefaultCeiling: tier?.defaultDiscountCeiling ?? null,
      }),
    ),
  );

  return {
    currencyCode: input.currencyCode,
    customerTier: tier,
    priceList: priceList ? { id: priceList.id, name: priceList.name } : null,
    lines,
    totals: totalsFor(lines),
  };
}

/* ── line pricing ─────────────────────────────────── */

type ProductRecord = Awaited<ReturnType<typeof loadProducts>> extends Map<
  string,
  infer T
>
  ? T
  : never;

type LineContext = {
  product: ProductRecord;
  priceListId: string | null;
  priceListName: string | null;
  ceilings: DiscountCeilings;
  tierDefaultCeiling: number | null;
};

async function priceLine(
  line: ResolvePriceLine,
  context: LineContext,
): Promise<PricedLine> {
  const { product } = context;
  const variant = line.variantId
    ? product.variants.find((entry) => entry.id === line.variantId)
    : undefined;

  if (line.variantId && !variant) {
    throw new ValidationError("Unknown product variant", [
      `variantId: ${line.variantId} does not belong to product ${product.sku}`,
    ]);
  }

  const listPrice = round2(
    Number(product.basePrice) + Number(variant?.extraPrice ?? 0),
  );

  const listed = context.priceListId
    ? await findPriceListItem(
        context.priceListId,
        product.id,
        line.variantId ?? null,
        line.quantity,
      )
    : null;

  const unitPrice = listed ? round2(Number(listed.unitPrice)) : listPrice;
  const priceSource = listed ? PRICE_SOURCE.PRICE_LIST : PRICE_SOURCE.BASE_PRICE;

  const { maxDiscountPercent, ceilingSource } = ceilingFor(
    product.categoryId,
    context.ceilings,
    context.tierDefaultCeiling,
  );

  const costPrice =
    product.costPrice === null ? null : round2(Number(product.costPrice));
  const taxPercent = Number(product.taxRate);

  const discountPercent = line.discountPercent;
  const gross = round2(unitPrice * line.quantity);
  const discountAmount = round2((gross * discountPercent) / 100);
  const lineSubtotal = round2(gross - discountAmount);
  const taxAmount = round2((lineSubtotal * taxPercent) / 100);
  const lineTotal = round2(lineSubtotal + taxAmount);

  const marginAmount =
    costPrice === null
      ? null
      : round2(lineSubtotal - costPrice * line.quantity);
  const marginPercent =
    marginAmount === null || lineSubtotal === 0
      ? null
      : round2((marginAmount / lineSubtotal) * 100);

  const excess = round2(Math.max(0, discountPercent - maxDiscountPercent));
  const ceilingUnitPrice = round2(unitPrice * (1 - maxDiscountPercent / 100));

  return {
    productId: product.id,
    variantId: line.variantId ?? null,
    sku: variant?.sku ?? product.sku,
    name: variant ? `${product.name} — ${variant.name}` : product.name,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    quantity: line.quantity,

    listPrice,
    unitPrice,
    priceSource,
    priceListId: context.priceListId,
    priceListName: context.priceListName,

    costPrice,
    taxPercent,

    maxDiscountPercent,
    ceilingSource,

    discountPercent,
    discountAmount,
    lineSubtotal,
    taxAmount,
    lineTotal,

    marginAmount,
    marginPercent,

    discountExcessPercent: excess,
    withinCeiling: excess === 0,
    ceilingUnitPrice,
    marginPercentAtCeiling:
      costPrice === null || ceilingUnitPrice === 0
        ? null
        : round2(((ceilingUnitPrice - costPrice) / ceilingUnitPrice) * 100),
  };
}

function totalsFor(lines: PricedLine[]): PricingResult["totals"] {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  );
  const discountTotal = round2(
    lines.reduce((sum, line) => sum + line.discountAmount, 0),
  );
  const taxTotal = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const grandTotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));

  // Margin is only meaningful when every line has a cost; a single unknown
  // cost would silently overstate it.
  const costed = lines.every((line) => line.marginAmount !== null);
  const netRevenue = round2(subtotal - discountTotal);
  const marginAmount = costed
    ? round2(lines.reduce((sum, line) => sum + (line.marginAmount ?? 0), 0))
    : null;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    grandTotal,
    marginAmount,
    marginPercent:
      marginAmount === null || netRevenue === 0
        ? null
        : round2((marginAmount / netRevenue) * 100),
  };
}

/* ── lookups ──────────────────────────────────────── */

async function resolveTier(input: ResolvePriceInput) {
  if (input.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: {
        customerTier: {
          select: { id: true, name: true, defaultDiscountCeiling: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError("Customer not found");
    }

    return toTier(customer.customerTier);
  }

  const tier = await prisma.customerTier.findUnique({
    where: { id: input.customerTierId! },
    select: { id: true, name: true, defaultDiscountCeiling: true },
  });

  if (!tier) {
    throw new NotFoundError("Customer tier not found");
  }

  return toTier(tier);
}

function toTier(
  tier: { id: string; name: string; defaultDiscountCeiling: unknown } | null,
) {
  return tier
    ? {
        id: tier.id,
        name: tier.name,
        defaultDiscountCeiling:
          tier.defaultDiscountCeiling === null
            ? null
            : Number(tier.defaultDiscountCeiling),
      }
    : null;
}

/** The active list for this tier and currency, newest valid window first. */
async function findActivePriceList(tierId: string, currencyCode: string) {
  const now = new Date();

  return prisma.priceList.findFirst({
    where: {
      customerTierId: tierId,
      currencyCode,
      isActive: true,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
    },
    orderBy: { validFrom: "desc" },
    select: { id: true, name: true },
  });
}

/**
 * The price list row for this product at this quantity. A variant-specific row
 * wins over the product-wide one, and narrower quantity bands are preferred so
 * a "100+" tier beats an open-ended row.
 */
async function findPriceListItem(
  priceListId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
) {
  const candidates = await prisma.priceListItem.findMany({
    where: {
      priceListId,
      productId,
      ...(variantId ? { OR: [{ variantId }, { variantId: null }] } : {}),
      AND: [
        { OR: [{ minQuantity: null }, { minQuantity: { lte: quantity } }] },
        { OR: [{ maxQuantity: null }, { maxQuantity: { gte: quantity } }] },
      ],
    },
    select: {
      id: true,
      unitPrice: true,
      variantId: true,
      minQuantity: true,
    },
  });

  return (
    candidates.sort((a, b) => {
      const variantRank =
        Number(b.variantId === variantId) - Number(a.variantId === variantId);

      if (variantRank !== 0) {
        return variantRank;
      }

      return Number(b.minQuantity ?? 0) - Number(a.minQuantity ?? 0);
    })[0] ?? null
  );
}

type DiscountCeilings = {
  byCategoryId: Map<string, number>;
  tierWide: number | null;
};

/**
 * All ceilings for a tier in one query. Higher `priority` wins, and within the
 * same priority the later rule does — matching how the rules were seeded.
 */
async function loadDiscountRules(tierId: string | null): Promise<DiscountCeilings> {
  if (!tierId) {
    return { byCategoryId: new Map(), tierWide: null };
  }

  const now = new Date();

  const rules = await prisma.discountRule.findMany({
    where: {
      customerTierId: tierId,
      isActive: true,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
    },
    orderBy: { priority: "asc" },
    select: { categoryId: true, maxDiscountPercent: true },
  });

  const byCategoryId = new Map<string, number>();
  let tierWide: number | null = null;

  for (const rule of rules) {
    if (rule.categoryId) {
      byCategoryId.set(rule.categoryId, Number(rule.maxDiscountPercent));
    } else {
      tierWide = Number(rule.maxDiscountPercent);
    }
  }

  return { byCategoryId, tierWide };
}

function ceilingFor(
  categoryId: string,
  ceilings: DiscountCeilings,
  tierDefault: number | null,
) {
  const categoryCeiling = ceilings.byCategoryId.get(categoryId);

  if (categoryCeiling !== undefined) {
    return {
      maxDiscountPercent: categoryCeiling,
      ceilingSource: CEILING_SOURCE.CATEGORY_RULE,
    };
  }

  if (ceilings.tierWide !== null) {
    return {
      maxDiscountPercent: ceilings.tierWide,
      ceilingSource: CEILING_SOURCE.TIER_RULE,
    };
  }

  if (tierDefault !== null) {
    return {
      maxDiscountPercent: tierDefault,
      ceilingSource: CEILING_SOURCE.TIER_DEFAULT,
    };
  }

  return { maxDiscountPercent: 0, ceilingSource: CEILING_SOURCE.NONE };
}

async function loadProducts(lines: ResolvePriceInput["lines"]) {
  const ids = [...new Set(lines.map((line) => line.productId))];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sku: true,
      name: true,
      basePrice: true,
      costPrice: true,
      taxRate: true,
      categoryId: true,
      category: { select: { name: true } },
      variants: { select: { id: true, sku: true, name: true, extraPrice: true } },
    },
  });

  if (products.length !== ids.length) {
    const found = new Set(products.map((product) => product.id));

    throw new ValidationError(
      "Unknown product",
      ids.filter((id) => !found.has(id)).map((id) => `productId: ${id} not found`),
    );
  }

  return new Map(products.map((product) => [product.id, product]));
}
