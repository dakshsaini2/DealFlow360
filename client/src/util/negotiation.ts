import { api } from './api';
import type { QuotationResponse } from './quotations';

/** The seller's view of the portal conversation. */
export type NegotiationComment = {
  id: string;
  quoteLineId: string | null;
  comment: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
  /** True when the author holds the CUSTOMER role, so the thread reads as a dialogue. */
  fromCustomer: boolean;
};

export type NegotiationChangeRequest = {
  id: string;
  quoteLineId: string | null;
  requestType: string;
  oldValue: { quantity?: number; discountPercent?: number } | null;
  newValue: { quantity?: number } | null;
  message: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  requestedBy: { id: string; firstName: string; lastName: string };
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
  quoteLine: { id: string; product: { sku: string; name: string } } | null;
};

export type NegotiationCounterOffer = {
  id: string;
  discountPercent: number;
  totalAmount: number;
  message: string | null;
  status: string;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string };
};

export type NegotiationThread = {
  changeRequests: NegotiationChangeRequest[];
  comments: NegotiationComment[];
  counterOffers: NegotiationCounterOffer[];
  pendingCount: number;
};

export async function fetchNegotiation(quotationId: string, signal?: AbortSignal) {
  const { data } = await api.get<NegotiationThread>(`/quotations/${quotationId}/negotiation`, {
    signal,
  });

  return data;
}

export async function postReply(
  quotationId: string,
  input: { quoteLineId?: string; comment: string },
) {
  const { data } = await api.post<NegotiationThread>(
    `/quotations/${quotationId}/negotiation/reply`,
    input,
  );

  return data;
}

export async function resolveChangeRequest(
  quotationId: string,
  requestId: string,
  input: { accept: boolean; reason?: string },
) {
  const { data } = await api.post<NegotiationThread>(
    `/quotations/${quotationId}/negotiation/change-requests/${requestId}`,
    input,
  );

  return data;
}

/**
 * Accepting applies the discount through the ordinary quotation path, so the
 * response carries the repriced quote — which may now be back in approval.
 */
export async function resolveCounterOffer(
  quotationId: string,
  offerId: string,
  input: { accept: boolean; reason?: string },
) {
  const { data } = await api.post<{
    negotiation: NegotiationThread;
    quotation: QuotationResponse | null;
  }>(`/quotations/${quotationId}/negotiation/counter-offers/${offerId}`, input);

  return data;
}
