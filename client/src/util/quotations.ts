import { api } from './api';
import type { PageMeta } from './customers';
import type { SubscriptionPlanRef } from './orders';

export type QuotationStatus = 'DRAFT' | 'SENT' | 'UNDER_NEGOTIATION' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';

export type QuotationSummary = {
  id: string;
  quoteNumber: string;
  status: QuotationStatus;
  approvalStatus: ApprovalStatus;
  approvalRequired: boolean;
  currencyCode: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  blendedRiskScore: number | null;
  validUntil: string | null;
  sentAt: string | null;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    customerCode: string;
    customerTier: { id: string; name: string } | null;
  };
  salesRep: { id: string; firstName: string; lastName: string };
  _count: { lines: number };
};

export type QuoteLine = {
  id: string;
  productId: string;
  variantId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number | null;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
  allowedDiscountPercent: number | null;
  discountExcessPercent: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  /** Set makes this a recurring line; null is an ordinary one-time sale. */
  subscriptionPlanId: string | null;
  subscriptionPlan: SubscriptionPlanRef | null;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    category: { id: string; name: string };
    /** The recurring plans this product may be sold on, if any. */
    productSubscriptionPlans: { subscriptionPlan: SubscriptionPlanRef }[];
  };
  variant: { id: string; sku: string; name: string } | null;
};

export type QuotationDetail = Omit<QuotationSummary, 'customer'> & {
  teamId: string | null;
  customer: QuotationSummary['customer'] & {
    email: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
    customerTier: { id: string; name: string; defaultDiscountCeiling: number | null } | null;
  };
  priceList: { id: string; name: string } | null;
  lines: QuoteLine[];
};

export type RiskBreakdown = {
  score: number;
  discountRisk: number;
  marginRisk: number;
  weightedExcessPercent: number;
  maxExcessPercent: number;
  marginPercent: number | null;
  offendingLines: {
    sku: string;
    name: string;
    categoryName: string;
    discountPercent: number;
    maxDiscountPercent: number;
    excessPercent: number;
  }[];
  reason: string;
};

export type QuotationResponse = { quotation: QuotationDetail; risk: RiskBreakdown };

export type Revision = {
  id: string;
  versionNumber: number;
  changeReason: string | null;
  createdAt: string;
  changedBy: { id: string; firstName: string; lastName: string };
  snapshotData: Record<string, unknown>;
};

export type QuotationListParams = {
  q?: string;
  customerId?: string;
  status?: string;
  approvalStatus?: string;
  scope?: 'all' | 'mine';
  sort?: 'recent' | 'created' | 'value';
  page?: number;
  pageSize?: number;
};

export async function fetchQuotations(params: QuotationListParams, signal?: AbortSignal) {
  const { data } = await api.get<{ data: QuotationSummary[]; meta: PageMeta }>('/quotations', {
    params,
    signal,
  });

  return data;
}

export async function fetchQuotation(id: string, signal?: AbortSignal) {
  const { data } = await api.get<QuotationResponse>(`/quotations/${id}`, { signal });

  return data;
}

export async function createQuotation(input: {
  customerId: string;
  lines?: { productId: string; quantity: number; discountPercent?: number }[];
}) {
  const { data } = await api.post<QuotationResponse>('/quotations', input);

  return data;
}

export async function addQuoteLine(
  id: string,
  input: { productId: string; variantId?: string; quantity: number; discountPercent?: number },
) {
  const { data } = await api.post<QuotationResponse>(`/quotations/${id}/lines`, input);

  return data;
}

export async function updateQuoteLine(
  id: string,
  lineId: string,
  input: {
    quantity?: number;
    discountPercent?: number;
    /** `null` converts a recurring line back to a one-time sale. */
    subscriptionPlanId?: string | null;
  },
) {
  const { data } = await api.patch<QuotationResponse>(`/quotations/${id}/lines/${lineId}`, input);

  return data;
}

export async function removeQuoteLine(id: string, lineId: string) {
  const { data } = await api.delete<QuotationResponse>(`/quotations/${id}/lines/${lineId}`);

  return data;
}

export async function applyOrderDiscount(id: string, discountPercent: number) {
  const { data } = await api.post<QuotationResponse>(`/quotations/${id}/discount`, {
    discountPercent,
  });

  return data;
}

export async function sendQuotation(id: string, reason?: string) {
  const { data } = await api.post<QuotationResponse>(`/quotations/${id}/send`, { reason });

  return data;
}

export async function fetchRevisions(id: string, signal?: AbortSignal) {
  const { data } = await api.get<{ data: Revision[] }>(`/quotations/${id}/revisions`, { signal });

  return data.data;
}

/* ── display helpers ────────────────────────────────── */

export const STATUS_TONE: Record<QuotationStatus, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> = {
  DRAFT: 'neutral',
  SENT: 'brand',
  UNDER_NEGOTIATION: 'amber',
  CONFIRMED: 'green',
  CANCELLED: 'red',
  EXPIRED: 'red',
};

export const APPROVAL_TONE: Record<ApprovalStatus, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> = {
  NOT_REQUIRED: 'neutral',
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  RETURNED: 'amber',
};

/** Mirrors the seeded ApprovalPolicy risk bands. */
export function riskBand(score: number) {
  if (score < 25) return { label: 'Auto-approve', tone: 'green' as const };
  if (score < 60) return { label: 'Manager approval', tone: 'amber' as const };

  return { label: 'Manager + Finance', tone: 'red' as const };
}

export function humanStatus(value: string) {
  return value.replace(/_/g, ' ').toLowerCase();
}

/* ── Upsell / cross-sell ────────────────────────────── */

export type Suggestion = {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  suggestionType: string;
  rank: number;
  score: number | null;
  becauseOf: string[];
  unitPrice: number;
  listPrice: number;
  revenueDelta: number;
  marginDelta: number | null;
  marginPercent: number | null;
  orderMarginPercentAfter: number | null;
  orderMarginDeltaPercent: number | null;
  riskScoreAfter: number;
  riskScoreDelta: number;
  promotion: { id: string; name: string; discountValue: number } | null;
  minimumMarginPercent: number | null;
};

export type SuggestionsResponse = {
  suggestions: Suggestion[];
  baseline: { riskScore: number; marginPercent: number | null };
};

export async function fetchSuggestions(id: string, signal?: AbortSignal) {
  const { data } = await api.get<SuggestionsResponse>(
    `/quotations/${id}/recommendations`,
    { signal },
  );

  return data;
}

export async function acceptSuggestion(
  id: string,
  productId: string,
  quantity = 1,
) {
  const { data } = await api.post<QuotationResponse>(
    `/quotations/${id}/recommendations/${productId}/accept`,
    { quantity },
  );

  return data;
}

export async function dismissSuggestion(id: string, productId: string) {
  const { data } = await api.post<SuggestionsResponse>(
    `/quotations/${id}/recommendations/${productId}/dismiss`,
    {},
  );

  return data;
}

export const SUGGESTION_LABELS: Record<string, string> = {
  UPSELL: 'Upsell',
  CROSS_SELL: 'Cross-sell',
  ACCESSORY: 'Accessory',
  SUBSTITUTE: 'Alternative',
};
