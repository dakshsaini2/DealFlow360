import { api } from './api';
import type { PageMeta } from './customers';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'ALLOCATED' | 'FULFILLED' | 'CANCELLED';
export type LineType = 'ONE_TIME' | 'RECURRING';

export type SubscriptionPlanRef = {
  id: string;
  name: string;
  billingInterval: string;
  intervalCount: number;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currencyCode: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  promisedDeliveryDate: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  quotation: { id: string; quoteNumber: string } | null;
  customer: {
    id: string;
    name: string;
    customerCode: string;
    customerTier: { id: string; name: string } | null;
  };
  salesRep: { id: string; firstName: string; lastName: string };
  _count: { lines: number };
};

export type OrderLine = {
  id: string;
  productId: string;
  variantId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  lineType: LineType;
  sourceQuoteLineId: string | null;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    category: { id: string; name: string };
  };
  variant: { id: string; sku: string; name: string } | null;
  subscriptionPlan: SubscriptionPlanRef | null;
};

export type OrderDetail = Omit<OrderSummary, 'customer' | 'quotation'> & {
  customer: OrderSummary['customer'] & {
    email: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
  };
  quotation: {
    id: string;
    quoteNumber: string;
    blendedRiskScore: number | null;
    approvalStatus: string;
    versionNumber: number;
  } | null;
  lines: OrderLine[];
};

/**
 * One order carries both billing types, so the money owed is two numbers, not
 * one — what is invoiced once, and what recurs each period.
 */
export type BillingSplit = {
  oneTime: { lineCount: number; total: number };
  recurring: { lineCount: number; total: number };
  isHybrid: boolean;
};

export type OrderResponse = { order: OrderDetail; billing: BillingSplit };

export type OrderListParams = {
  q?: string;
  customerId?: string;
  status?: string;
  scope?: 'all' | 'mine';
  sort?: 'recent' | 'created' | 'value';
  page?: number;
  pageSize?: number;
};

export async function fetchOrders(params: OrderListParams, signal?: AbortSignal) {
  const { data } = await api.get<{ data: OrderSummary[]; meta: PageMeta }>('/orders', {
    params,
    signal,
  });

  return data;
}

export async function fetchOrder(id: string, signal?: AbortSignal) {
  const { data } = await api.get<OrderResponse>(`/orders/${id}`, { signal });

  return data;
}

/** Quote to order. The server refuses unless approval has actually cleared. */
export async function confirmQuotation(
  quotationId: string,
  input: { promisedDeliveryDate?: string; reason?: string } = {},
) {
  const { data } = await api.post<OrderResponse>(`/quotations/${quotationId}/confirm`, input);

  return data;
}

export async function cancelOrder(id: string, reason: string) {
  const { data } = await api.post<OrderResponse>(`/orders/${id}/cancel`, { reason });

  return data;
}

/* ── display helpers ────────────────────────────────── */

export const ORDER_STATUS_TONE: Record<OrderStatus, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> = {
  PENDING: 'neutral',
  CONFIRMED: 'brand',
  ALLOCATED: 'amber',
  FULFILLED: 'green',
  CANCELLED: 'red',
};

/** "Monthly" / "every 3 months" — how often a recurring line bills. */
export function planCadence(plan: SubscriptionPlanRef | null): string {
  if (!plan) return 'one-time';

  const unit = plan.billingInterval.toLowerCase();

  return plan.intervalCount === 1 ? `every ${unit}` : `every ${plan.intervalCount} ${unit}s`;
}
