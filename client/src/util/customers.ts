import { api } from './api';

export type CustomerTier = {
  id: string;
  name: string;
  description: string | null;
  defaultDiscountCeiling: number | null;
};

export type CustomerSummary = {
  id: string;
  name: string;
  customerCode: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customerTier: Pick<CustomerTier, 'id' | 'name' | 'defaultDiscountCeiling'> | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
};

export type CustomerDetail = CustomerSummary & {
  billingAddress: string | null;
  shippingAddress: string | null;
};

export type CustomerHistory = {
  quotationCount: number;
  openQuotationValue: number;
  orderCount: number;
  orderValue: number;
  quotationsByStatus: Record<string, number>;
  recentQuotations: {
    id: string;
    quoteNumber: string;
    status: string;
    approvalStatus: string;
    grandTotal: number;
    currencyCode: string;
    updatedAt: string;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    grandTotal: number;
    currencyCode: string;
    createdAt: string;
  }[];
};

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CustomerListParams = {
  q?: string;
  tierId?: string;
  status?: 'active' | 'inactive' | 'all';
  sort?: 'recent' | 'name' | 'created';
  page?: number;
  pageSize?: number;
};

export type CustomerInput = {
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  customerTierId?: string;
  isActive?: boolean;
};

export async function fetchCustomers(params: CustomerListParams, signal?: AbortSignal) {
  const { data } = await api.get<{ data: CustomerSummary[]; meta: PageMeta }>('/customers', {
    params,
    signal,
  });

  return data;
}

export async function fetchCustomerTiers(signal?: AbortSignal) {
  const { data } = await api.get<{ data: CustomerTier[] }>('/customers/tiers', { signal });

  return data.data;
}

export async function fetchCustomer(id: string, signal?: AbortSignal) {
  const { data } = await api.get<{ customer: CustomerDetail; history: CustomerHistory }>(
    `/customers/${id}`,
    { signal },
  );

  return data;
}

export async function createCustomer(input: CustomerInput) {
  const { data } = await api.post<{ customer: CustomerSummary }>('/customers', input);

  return data.customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const { data } = await api.patch<{ customer: CustomerSummary }>(`/customers/${id}`, input);

  return data.customer;
}

/** The badge colour a tier gets everywhere it is displayed. */
export function tierTone(name: string | undefined) {
  if (name === 'Enterprise') return 'brand' as const;
  if (name === 'Premium') return 'green' as const;

  return 'neutral' as const;
}
