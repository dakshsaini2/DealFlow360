import { NotFoundError } from "../../common/errors/AppError.js";
import { prisma } from "../../common/utils/prisma.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { round2 } from "../../common/utils/serialize.js";
import type { ListProductsQuery } from "./catalog.types.js";

/** The product row every list — catalog or admin — hands back. */
export const PRODUCT_LIST_SELECT = {
  id: true,
  sku: true,
  name: true,
  description: true,
  productType: true,
  basePrice: true,
  costPrice: true,
  unit: true,
  taxRate: true,
  isActive: true,
  category: { select: { id: true, name: true } },
  _count: { select: { variants: true, productSubscriptionPlans: true } },
} as const;

export async function listProducts(
  query: ListProductsQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const where = {
    ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.productType ? { productType: query.productType } : {}),
    ...(query.recurringOnly
      ? { productSubscriptionPlans: { some: {} } }
      : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { sku: { contains: query.q, mode: "insensitive" as const } },
            { description: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    query.sort === "priceAsc"
      ? { basePrice: "asc" as const }
      : query.sort === "priceDesc"
        ? { basePrice: "desc" as const }
        : query.sort === "recent"
          ? { createdAt: "desc" as const }
          : { name: "asc" as const };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: page.skip,
      take: page.take,
      select: PRODUCT_LIST_SELECT,
    }),
    prisma.product.count({ where }),
  ]);

  return paginated(rows.map(toProductListItem), total, page);
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      ...PRODUCT_LIST_SELECT,
      createdAt: true,
      variants: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          sku: true,
          name: true,
          extraPrice: true,
          attributeValues: {
            select: {
              attributeValue: {
                select: {
                  value: true,
                  attribute: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      productSubscriptionPlans: {
        select: {
          subscriptionPlan: {
            select: {
              id: true,
              name: true,
              billingInterval: true,
              intervalCount: true,
              prorationEnabled: true,
            },
          },
        },
      },
      priceListItems: {
        select: {
          unitPrice: true,
          minQuantity: true,
          maxQuantity: true,
          variantId: true,
          priceList: {
            select: {
              id: true,
              name: true,
              currencyCode: true,
              isActive: true,
              customerTier: { select: { id: true, name: true } },
            },
          },
        },
      },
      inventory: {
        select: {
          onHandQuantity: true,
          reservedQuantity: true,
          reorderLevel: true,
          warehouse: { select: { id: true, code: true, name: true } },
        },
      },
      relationshipsFrom: {
        where: { isActive: true },
        orderBy: { score: "desc" },
        select: {
          relationshipType: true,
          score: true,
          targetProduct: {
            select: { id: true, sku: true, name: true, basePrice: true },
          },
        },
      },
      promotionProducts: {
        select: {
          promotion: {
            select: {
              id: true,
              name: true,
              discountType: true,
              discountValue: true,
              startAt: true,
              endAt: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    throw new NotFoundError("Product not found");
  }

  const inventory = product.inventory.map((row) => ({
    warehouse: row.warehouse,
    onHand: Number(row.onHandQuantity),
    reserved: Number(row.reservedQuantity),
    available: round2(Number(row.onHandQuantity) - Number(row.reservedQuantity)),
    reorderLevel: Number(row.reorderLevel),
  }));

  const now = new Date();

  return {
    ...toProductListItem(product),
    createdAt: product.createdAt.toISOString(),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      extraPrice: Number(variant.extraPrice),
      attributes: variant.attributeValues.map((entry) => ({
        name: entry.attributeValue.attribute.name,
        value: entry.attributeValue.value,
      })),
    })),
    subscriptionPlans: product.productSubscriptionPlans.map(
      (entry) => entry.subscriptionPlan,
    ),
    tierPricing: product.priceListItems
      .filter((item) => item.priceList.isActive)
      .map((item) => ({
        priceListId: item.priceList.id,
        priceListName: item.priceList.name,
        currencyCode: item.priceList.currencyCode,
        tier: item.priceList.customerTier,
        variantId: item.variantId,
        unitPrice: Number(item.unitPrice),
        minQuantity: item.minQuantity === null ? null : Number(item.minQuantity),
        maxQuantity: item.maxQuantity === null ? null : Number(item.maxQuantity),
      }))
      .sort((a, b) => b.unitPrice - a.unitPrice),
    inventory,
    totalAvailable: round2(
      inventory.reduce((sum, row) => sum + row.available, 0),
    ),
    relatedProducts: product.relationshipsFrom.map((relation) => ({
      relationshipType: relation.relationshipType,
      score: relation.score === null ? null : Number(relation.score),
      product: {
        ...relation.targetProduct,
        basePrice: Number(relation.targetProduct.basePrice),
      },
    })),
    promotions: product.promotionProducts
      .map((entry) => entry.promotion)
      .filter(
        (promotion) =>
          promotion.isActive &&
          promotion.startAt <= now &&
          promotion.endAt >= now,
      )
      .map((promotion) => ({
        id: promotion.id,
        name: promotion.name,
        discountType: promotion.discountType,
        discountValue: Number(promotion.discountValue),
      })),
  };
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      parentCategoryId: true,
      _count: { select: { products: true } },
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    parentCategoryId: category.parentCategoryId,
    productCount: category._count.products,
  }));
}

/* ── helpers ──────────────────────────────────────── */

export type ProductListRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  productType: string;
  basePrice: unknown;
  costPrice: unknown;
  unit: string;
  taxRate: unknown;
  isActive: boolean;
  category: { id: string; name: string };
  _count: { variants: number; productSubscriptionPlans: number };
};

/**
 * Flattens the Prisma row and derives the list margin, so the catalog can show
 * headroom without every caller repeating the arithmetic.
 */
export function toProductListItem(product: ProductListRow) {
  const basePrice = Number(product.basePrice);
  const costPrice = product.costPrice === null ? null : Number(product.costPrice);

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    productType: product.productType,
    unit: product.unit,
    isActive: product.isActive,
    basePrice: round2(basePrice),
    costPrice: costPrice === null ? null : round2(costPrice),
    taxRate: Number(product.taxRate),
    category: product.category,
    variantCount: product._count.variants,
    isRecurringCapable: product._count.productSubscriptionPlans > 0,
    listMarginAmount: costPrice === null ? null : round2(basePrice - costPrice),
    listMarginPercent:
      costPrice === null || basePrice === 0
        ? null
        : round2(((basePrice - costPrice) / basePrice) * 100),
  };
}
