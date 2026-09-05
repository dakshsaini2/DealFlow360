import { api } from './api';
import type { PageMeta } from './customers';
import type { SubscriptionPlanRef } from './orders';

export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';
export type PaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'CHEQUE' | 'CREDIT_NOTE';

export type BillingSchedule = {
  id: string;
  billingDate: string;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  amount: number;
  prorationAmount: number;
  status: 'SCHEDULED' | 'INVOICED' | 'PAID' | 'SKIPPED' | 'CANCELLED';
  invoiceId: string | null;
};

export type SubscriptionLine = {
  id: string;
  orderLineId: string;
  productId: string;
  subscriptionPlanId: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  status: SubscriptionStatus;
  product: { id: string; sku: string; name: string; unit: string; taxRate: number };
  subscriptionPlan: SubscriptionPlanRef & {
    prorationEnabled: boolean;
    cancellationPolicy: string | null;
    refundPolicy: string | null;
  };
  billingSchedules: BillingSchedule[];
};

export type ProrationEvent = {
  id: string;
  subscriptionLineId: string;
  eventType: 'QUANTITY_CHANGE' | 'PLAN_CHANGE' | 'CANCELLATION';
  oldQuantity: number | null;
  newQuantity: number | null;
  effectiveAt: string;
  unusedPeriodAmount: number;
  newPeriodAmount: number;
  prorationAmount: number;
  reason: string | null;
  createdAt: string;
};

export type SubscriptionDetail = {
  id: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string;
  currencyCode: string;
  createdAt: string;
  customer: { id: string; name: string; customerCode: string };
  order: { id: string; orderNumber: string; salesRepId: string; status: string };
  lines: SubscriptionLine[];
  prorationEvents: ProrationEvent[];
};

export type SubscriptionResponse = {
  subscription: SubscriptionDetail | null;
  recurringTotal: number;
};

export type CancelResponse = SubscriptionResponse & {
  refundDue: number;
  creditNote: { id: string; creditNoteNumber: string; amount: number } | null;
};

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  invoiceType: 'ONE_TIME' | 'RECURRING';
  status: InvoiceStatus;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  currencyCode: string;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  customer: { id: string; name: string; customerCode: string };
  order: { id: string; orderNumber: string } | null;
  _count: { lines: number; payments: number };
};

export type InvoiceDetail = InvoiceSummary & {
  lines: {
    id: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
    periodStart: string | null;
    periodEnd: string | null;
    orderLine: {
      id: string;
      lineType: string;
      product: { id: string; sku: string; name: string };
    } | null;
    subscriptionLine: {
      id: string;
      product: { id: string; sku: string; name: string };
      subscriptionPlan: { id: string; name: string };
    } | null;
  }[];
  payments: {
    id: string;
    amount: number;
    currencyCode: string;
    paymentMethod: PaymentMethod;
    transactionReference: string | null;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }[];
  creditNotes: {
    id: string;
    creditNoteNumber: string;
    reason: string;
    amount: number;
    status: string;
    issuedAt: string;
  }[];
};

/* ── subscriptions ──────────────────────────────────── */

export async function fetchSubscriptionForOrder(orderId: string, signal?: AbortSignal) {
  const { data } = await api.get<SubscriptionResponse>(`/orders/${orderId}/subscription`, {
    signal,
  });

  return data;
}

export async function fetchSubscription(id: string, signal?: AbortSignal) {
  const { data } = await api.get<SubscriptionResponse>(`/subscriptions/${id}`, { signal });

  return data;
}

export async function changeSubscriptionQuantity(
  subscriptionId: string,
  lineId: string,
  input: { quantity: number; effectiveAt?: string; reason?: string },
) {
  const { data } = await api.patch<SubscriptionResponse>(
    `/subscriptions/${subscriptionId}/lines/${lineId}`,
    input,
  );

  return data;
}

export async function cancelSubscription(
  subscriptionId: string,
  input: { subscriptionLineId?: string; atPeriodEnd: boolean; reason: string },
) {
  const { data } = await api.post<CancelResponse>(
    `/subscriptions/${subscriptionId}/cancel`,
    input,
  );

  return data;
}

/* ── invoices ───────────────────────────────────────── */

export type InvoiceListParams = {
  q?: string;
  customerId?: string;
  orderId?: string;
  status?: string;
  invoiceType?: 'ONE_TIME' | 'RECURRING';
  scope?: 'all' | 'mine';
  page?: number;
};

export async function fetchInvoices(params: InvoiceListParams, signal?: AbortSignal) {
  const { data } = await api.get<{ data: InvoiceSummary[]; meta: PageMeta }>('/invoices', {
    params,
    signal,
  });

  return data;
}

export async function fetchInvoice(id: string, signal?: AbortSignal) {
  const { data } = await api.get<{ invoice: InvoiceDetail }>(`/invoices/${id}`, { signal });

  return data.invoice;
}

export async function recordPayment(
  invoiceId: string,
  input: {
    amount: number;
    paymentMethod: PaymentMethod;
    transactionReference?: string;
    reason?: string;
  },
) {
  const { data } = await api.post<{ invoice: InvoiceDetail }>(
    `/invoices/${invoiceId}/payments`,
    input,
  );

  return data.invoice;
}

/** The recurring billing run — issues every period that has come due. */
export async function runRecurringBilling(input: { subscriptionId?: string; upTo?: string } = {}) {
  const { data } = await api.post<{
    issued: { invoiceId: string; invoiceNumber: string; grandTotal: number }[];
    message: string;
  }>('/invoices/run-recurring', input);

  return data;
}

/* ── display helpers ────────────────────────────────── */

export const SUBSCRIPTION_TONE: Record<
  SubscriptionStatus,
  'neutral' | 'brand' | 'green' | 'amber' | 'red'
> = {
  ACTIVE: 'green',
  PAUSED: 'amber',
  CANCELLED: 'red',
  EXPIRED: 'neutral',
};

export const INVOICE_TONE: Record<InvoiceStatus, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> = {
  DRAFT: 'neutral',
  ISSUED: 'brand',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
  OVERDUE: 'red',
  VOID: 'neutral',
};

export const SCHEDULE_TONE: Record<
  BillingSchedule['status'],
  'neutral' | 'brand' | 'green' | 'amber' | 'red'
> = {
  SCHEDULED: 'neutral',
  INVOICED: 'brand',
  PAID: 'green',
  SKIPPED: 'amber',
  CANCELLED: 'red',
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CREDIT_NOTE', label: 'Credit note' },
];
