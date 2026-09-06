import { api } from './api';
import type { ProductSummary } from './catalog';

export type AdminWarehouse = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  shippingCostWeight: number;
  isActive: boolean;
  _count: { inventory: number };
};

export type AdminStockRow = {
  id: string;
  product: { id: string; sku: string; name: string; unit: string };
  variant: { id: string; sku: string; name: string } | null;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  reorderQuantity: number;
  belowReorderLevel: boolean;
  updatedAt: string;
};

export type AdminPlan = {
  id: string;
  name: string;
  billingInterval: string;
  intervalCount: number;
  price: number;
  currencyCode: string;
  prorationEnabled: boolean;
  cancellationPolicy: string | null;
  refundPolicy: string | null;
  isActive: boolean;
  products: { id: string; sku: string; name: string }[];
  subscriptionLineCount: number;
};

export type AdminDiscountRule = {
  id: string;
  categoryId: string | null;
  maxDiscountPercent: number;
  priority: number;
  isActive: boolean;
  category: { id: string; name: string } | null;
};

export type AdminTier = {
  id: string;
  name: string;
  description: string | null;
  defaultDiscountCeiling: number | null;
  isActive: boolean;
  _count: { customers: number };
  discountRules: AdminDiscountRule[];
};

export type ApprovalPolicy = {
  id: string;
  name: string;
  description: string | null;
  riskMin: number;
  riskMax: number;
  isActive: boolean;
  steps: { id: string; stepOrder: number; role: string; isRequired: boolean }[];
};

export type Governance = {
  tiers: AdminTier[];
  categories: { id: string; name: string }[];
  approvalPolicies: ApprovalPolicy[];
};

export type AdminSetting = {
  key: string;
  value: string;
  isDefault: boolean;
  default: string;
};

/* ── product master ─────────────────────────────────── */

/** Admin only; a sales manager gets a 403 from this one route. */
export async function createProduct(input: {
  sku: string;
  name: string;
  categoryId: string;
  description?: string;
  productType: 'GOODS' | 'SERVICE';
  basePrice: number;
  costPrice?: number;
  unit: string;
  taxRate: number;
}) {
  const { data } = await api.post<{ product: ProductSummary }>('/admin/products', input);

  return data.product;
}

/* ── warehouses ─────────────────────────────────────── */

export async function fetchAdminWarehouses(signal?: AbortSignal) {
  const { data } = await api.get<{ data: AdminWarehouse[] }>('/admin/warehouses', { signal });

  return data.data;
}

export async function createWarehouse(input: {
  code: string;
  name: string;
  address?: string;
  shippingCostWeight: number;
}) {
  const { data } = await api.post<{ warehouse: AdminWarehouse }>('/admin/warehouses', input);

  return data.warehouse;
}

export async function updateWarehouse(
  id: string,
  input: Partial<{ name: string; shippingCostWeight: number; isActive: boolean }>,
) {
  const { data } = await api.patch<{ warehouse: AdminWarehouse }>(
    `/admin/warehouses/${id}`,
    input,
  );

  return data.warehouse;
}

/** Everything one warehouse holds, newest reservation state included. */
export async function fetchWarehouseStock(warehouseId: string, signal?: AbortSignal) {
  const { data } = await api.get<{ data: AdminStockRow[] }>(
    `/admin/warehouses/${warehouseId}/stock`,
    { signal },
  );

  return data.data;
}

export async function setStock(
  warehouseId: string,
  input: { productId: string; onHandQuantity: number; reorderLevel?: number },
) {
  const { data } = await api.put<{
    stock: { id: string; onHandQuantity: number; reservedQuantity: number; available: number };
  }>(`/admin/warehouses/${warehouseId}/stock`, input);

  return data.stock;
}

/* ── subscription plans ─────────────────────────────── */

export async function fetchAdminPlans(signal?: AbortSignal) {
  const { data } = await api.get<{ data: AdminPlan[] }>('/admin/subscription-plans', { signal });

  return data.data;
}

export async function createPlan(input: {
  name: string;
  billingInterval: string;
  intervalCount: number;
  prorationEnabled: boolean;
  cancellationPolicy?: string;
  refundPolicy?: string;
}) {
  const { data } = await api.post<{ plan: AdminPlan }>('/admin/subscription-plans', input);

  return data.plan;
}

export async function updatePlan(
  id: string,
  input: Partial<{ prorationEnabled: boolean; isActive: boolean; intervalCount: number }>,
) {
  const { data } = await api.patch<{ plan: AdminPlan }>(
    `/admin/subscription-plans/${id}`,
    input,
  );

  return data.plan;
}

export async function setPlanProducts(id: string, productIds: string[]) {
  const { data } = await api.put<{ data: AdminPlan[] }>(
    `/admin/subscription-plans/${id}/products`,
    { productIds },
  );

  return data.data;
}

/* ── discount governance ────────────────────────────── */

export async function fetchGovernance(signal?: AbortSignal) {
  const { data } = await api.get<Governance>('/admin/discounts', { signal });

  return data;
}

export async function createTier(input: {
  name: string;
  description?: string;
  defaultDiscountCeiling: number;
}) {
  const { data } = await api.post<{ tier: AdminTier }>('/admin/tiers', input);

  return data.tier;
}

export async function updateTier(
  id: string,
  input: Partial<{ name: string; defaultDiscountCeiling: number }>,
) {
  const { data } = await api.patch<{ tier: AdminTier }>(`/admin/tiers/${id}`, input);

  return data.tier;
}

/** Setting the same tier-and-category pair again edits the rule, never stacks one. */
export async function upsertDiscountRule(input: {
  customerTierId: string;
  categoryId?: string | null;
  maxDiscountPercent: number;
  priority?: number;
}) {
  const { data } = await api.put<{ rule: AdminDiscountRule }>('/admin/discount-rules', input);

  return data.rule;
}

export async function deleteDiscountRule(id: string) {
  await api.delete(`/admin/discount-rules/${id}`);
}

/* ── thresholds ─────────────────────────────────────── */

export async function fetchSettings(signal?: AbortSignal) {
  const { data } = await api.get<{ data: AdminSetting[] }>('/admin/settings', { signal });

  return data.data;
}

export async function updateSettings(settings: { key: string; value: string }[]) {
  const { data } = await api.patch<{ data: AdminSetting[] }>('/admin/settings', { settings });

  return data.data;
}

export const SETTING_LABELS: Record<string, string> = {
  STALLED_DEAL_DAYS: 'Days before a deal counts as stalled',
  DISCOUNT_ANOMALY_MULTIPLIER: "Multiple of a rep's average that flags a discount",
  APPROVAL_RISK_THRESHOLD: 'Risk score at which approval is required',
  QUOTE_VALIDITY_DAYS: 'Default quotation validity, in days',
  SHIPMENT_BASE_COST: 'Base cost of one shipment',
  BACKORDER_RESTOCK_DAYS: 'Expected days until backordered stock arrives',
  BILLING_SCHEDULE_HORIZON: 'Billing periods scheduled ahead',
  INVOICE_DUE_DAYS: 'Days an invoice has to be paid',
};
