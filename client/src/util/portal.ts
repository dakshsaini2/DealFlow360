import { api } from './api';
import type { PageMeta } from './customers';
import type { SubscriptionPlanRef } from './orders';

/**
 * The customer-facing shapes.
 *
 * These deliberately do not extend the internal quotation types: the server
 * never sends cost, margin, discount ceilings, the risk score or the approval
 * state to a portal user, and mirroring that here keeps it impossible for a
 * portal screen to render a field that does not exist.
 */

export type PortalState = { label: string; detail: string };

export type PortalQuotationSummary = {
  id: string;
  quoteNumber: string;
  status: string;
  currencyCode: string;
  grandTotal: number;
  validUntil: string | null;
  sentAt: string | null;
  versionNumber: number;
  updatedAt: string;
  customer: { id: string; name: string };
  _count: { lines: number; changeRequests: number };
  state: PortalState;
};

export type PortalLine = {
  id: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    description: string | null;
    category: { name: string };
  };
  variant: { sku: string; name: string } | null;
  subscriptionPlan: SubscriptionPlanRef | null;
};

export type PortalComment = {
  id: string;
  quoteLineId: string | null;
  comment: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
};

export type PortalChangeRequest = {
  id: string;
  quoteLineId: string | null;
  requestType: string;
  newValue: { quantity?: number } | null;
  message: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type PortalCounterOffer = {
  id: string;
  discountPercent: number;
  totalAmount: number;
  message: string | null;
  status: string;
  createdAt: string;
};

export type PortalQuotation = {
  id: string;
  quoteNumber: string;
  status: string;
  currencyCode: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  validUntil: string | null;
  sentAt: string | null;
  confirmedAt: string | null;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    customerCode: string;
    email: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
  };
  contact: string;
  lines: PortalLine[];
  lineComments: PortalComment[];
  changeRequests: PortalChangeRequest[];
  counterOffers: PortalCounterOffer[];
};

export type PortalResponse = {
  quotation: PortalQuotation;
  state: PortalState;
  canNegotiate: boolean;
  canConfirm: boolean;
};

export async function fetchPortalQuotations(signal?: AbortSignal) {
  const { data } = await api.get<{ data: PortalQuotationSummary[]; meta: PageMeta }>(
    '/portal/quotations',
    { signal },
  );

  return data;
}

export async function fetchPortalQuotation(id: string, signal?: AbortSignal) {
  const { data } = await api.get<PortalResponse>(`/portal/quotations/${id}`, { signal });

  return data;
}

export async function postComment(id: string, input: { quoteLineId?: string; comment: string }) {
  const { data } = await api.post<PortalResponse>(`/portal/quotations/${id}/comments`, input);

  return data;
}

export async function postChangeRequest(
  id: string,
  input: {
    quoteLineId?: string;
    requestType: 'QUANTITY' | 'REMOVE_LINE' | 'DISCOUNT' | 'DELIVERY' | 'OTHER';
    requestedQuantity?: number;
    message: string;
  },
) {
  const { data } = await api.post<PortalResponse>(
    `/portal/quotations/${id}/change-requests`,
    input,
  );

  return data;
}

export async function postCounterOffer(
  id: string,
  input: { discountPercent: number; message?: string },
) {
  const { data } = await api.post<PortalResponse>(
    `/portal/quotations/${id}/counter-offers`,
    input,
  );

  return data;
}

export async function confirmFromPortal(id: string, reason?: string) {
  const { data } = await api.post<{
    orderId: string;
    orderNumber: string;
    confirmed: boolean;
  }>(`/portal/quotations/${id}/confirm`, { reason });

  return data;
}

/** The customer-facing state label carries its own tone. */
export function stateTone(label: string): 'neutral' | 'brand' | 'green' | 'amber' | 'red' {
  if (label === 'Confirmed') return 'green';
  if (label === 'Under review') return 'amber';
  if (label === 'Under negotiation') return 'brand';
  if (label === 'Awaiting pricing') return 'amber';
  if (label === 'Expired') return 'red';

  return 'neutral';
}

/* ── the storefront ─────────────────────────────────── */

export type PortalAccount = {
  id: string;
  name: string;
  customerCode: string;
  isPrimary: boolean;
  tier: string | null;
};

/**
 * A product as the customer sees it: their price, and nothing about how it was
 * arrived at. Cost, margin and the rep's discount ceiling are absent by design.
 */
export type StoreProduct = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  category: { id: string; name: string };
  unitPrice: number | null;
  /** Only present when the customer's tier price beats the list price. */
  listPrice: number | null;
  taxPercent: number | null;
  subscriptionPlans: SubscriptionPlanRef[];
};

export type StoreCategory = { id: string; name: string; _count: { products: number } };

export type RequestLine = {
  productId: string;
  quantity: number;
  subscriptionPlanId?: string;
};

export async function fetchPortalAccounts(signal?: AbortSignal) {
  const { data } = await api.get<{ accounts: PortalAccount[] }>('/portal/accounts', { signal });

  return data.accounts;
}

export async function fetchStoreProducts(
  params: { customerId?: string; q?: string; categoryId?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
) {
  const { data } = await api.get<{ data: StoreProduct[]; meta: PageMeta }>('/portal/products', {
    params,
    signal,
  });

  return data;
}

export async function fetchStoreCategories(signal?: AbortSignal) {
  const { data } = await api.get<{ data: StoreCategory[] }>('/portal/categories', { signal });

  return data.data;
}

/**
 * Submits the basket. It becomes a *draft* for the account's rep — the customer
 * is asking for a quotation, not placing a priced order, so discounting and
 * approval stay on the seller's side.
 */
export async function submitPortalRequest(input: {
  customerId?: string;
  lines: RequestLine[];
  message?: string;
}) {
  const { data } = await api.post<{
    request: {
      id: string;
      quoteNumber: string;
      status: string;
      grandTotal: number;
      currencyCode: string;
      createdAt: string;
      contact: string;
    };
  }>('/portal/requests', input);

  return data.request;
}
