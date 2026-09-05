import { api } from './api';
import type { PageMeta } from './customers';

export type Category = {
  id: string;
  name: string;
  description: string | null;
  parentCategoryId: string | null;
  productCount: number;
};

export type ProductSummary = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  productType: string;
  unit: string;
  isActive: boolean;
  basePrice: number;
  costPrice: number | null;
  taxRate: number;
  category: { id: string; name: string };
  variantCount: number;
  isRecurringCapable: boolean;
  listMarginAmount: number | null;
  listMarginPercent: number | null;
};

export type ProductDetail = ProductSummary & {
  createdAt: string;
  variants: {
    id: string;
    sku: string;
    name: string;
    extraPrice: number;
    attributes: { name: string; value: string }[];
  }[];
  subscriptionPlans: {
    id: string;
    name: string;
    billingInterval: string;
    intervalCount: number;
    prorationEnabled: boolean;
  }[];
  tierPricing: {
    priceListId: string;
    priceListName: string;
    currencyCode: string;
    tier: { id: string; name: string } | null;
    variantId: string | null;
    unitPrice: number;
    minQuantity: number | null;
    maxQuantity: number | null;
  }[];
  inventory: {
    warehouse: { id: string; code: string; name: string };
    onHand: number;
    reserved: number;
    available: number;
    reorderLevel: number;
  }[];
  totalAvailable: number;
  relatedProducts: {
    relationshipType: string;
    score: number | null;
    product: { id: string; sku: string; name: string; basePrice: number };
  }[];
  promotions: { id: string; name: string; discountType: string; discountValue: number }[];
};

export type ProductListParams = {
  q?: string;
  categoryId?: string;
  productType?: 'GOODS' | 'SERVICE';
  status?: 'active' | 'inactive' | 'all';
  sort?: 'name' | 'priceAsc' | 'priceDesc' | 'recent';
  recurringOnly?: 'true' | 'false';
  page?: number;
  pageSize?: number;
};

/* ── Pricing engine ─────────────────────────────────── */

export type PricedLine = {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  priceSource: 'PRICE_LIST' | 'BASE_PRICE';
  priceListId: string | null;
  priceListName: string | null;
  costPrice: number | null;
  taxPercent: number;
  maxDiscountPercent: number;
  ceilingSource: 'CATEGORY_RULE' | 'TIER_RULE' | 'TIER_DEFAULT' | 'NONE';
  discountPercent: number;
  discountAmount: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  marginAmount: number | null;
  marginPercent: number | null;
  discountExcessPercent: number;
  withinCeiling: boolean;
  ceilingUnitPrice: number;
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

export type ResolvePriceRequest = {
  customerId?: string;
  customerTierId?: string;
  currencyCode?: string;
  lines: {
    productId: string;
    variantId?: string;
    quantity: number;
    discountPercent?: number;
  }[];
};

export async function fetchProducts(params: ProductListParams, signal?: AbortSignal) {
  const { data } = await api.get<{ data: ProductSummary[]; meta: PageMeta }>('/catalog/products', {
    params,
    signal,
  });

  return data;
}

export async function fetchProduct(id: string, signal?: AbortSignal) {
  const { data } = await api.get<{ product: ProductDetail }>(`/catalog/products/${id}`, { signal });

  return data.product;
}

export async function fetchCategories(signal?: AbortSignal) {
  const { data } = await api.get<{ data: Category[] }>('/catalog/categories', { signal });

  return data.data;
}

export async function resolvePricing(request: ResolvePriceRequest, signal?: AbortSignal) {
  const { data } = await api.post<PricingResult>('/catalog/pricing/resolve', request, { signal });

  return data;
}

/** Green when there is healthy room left, amber when tight, red when over. */
export function marginTone(percent: number | null) {
  if (percent === null) return 'neutral' as const;
  if (percent < 10) return 'red' as const;
  if (percent < 25) return 'amber' as const;

  return 'green' as const;
}

export const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
