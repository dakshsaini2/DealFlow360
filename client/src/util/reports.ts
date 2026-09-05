import { api, getToken } from './api';

export type SalesReportParams = {
  period?: 'today' | 'week' | 'month' | 'quarter' | 'custom';
  from?: string;
  to?: string;
  salesRepId?: string;
  teamId?: string;
  approvalStatus?: string;
  status?: string;
  categoryId?: string;
  productId?: string;
};

export type SalesReport = {
  period: { label: string; from: string; to: string };
  summary: {
    quotations: number;
    quotationValue: number;
    won: number;
    wonValue: number;
    lost: number;
    open: number;
    openValue: number;
    winRatePercent: number | null;
    averageDealSize: number;
    averageDiscountPercent: number;
    orders: number;
    orderValue: number;
    invoiced: number;
    collected: number;
    outstanding: number;
  };
  byRep: { id: string; name: string; quotes: number; won: number; value: number; wonValue: number }[];
  byCategory: { id: string; name: string; units: number; revenue: number; discount: number }[];
  byProduct: {
    id: string;
    sku: string;
    name: string;
    units: number;
    revenue: number;
    discount: number;
    discountPercent: number;
  }[];
  byApproval: { status: string; count: number; value: number }[];
  rows: {
    id: string;
    quoteNumber: string;
    customer: string;
    salesRep: string;
    team: string | null;
    status: string;
    approvalStatus: string;
    riskScore: number | null;
    subtotal: number;
    discountTotal: number;
    grandTotal: number;
    currencyCode: string;
    createdAt: string;
    confirmedAt: string | null;
  }[];
};

export async function fetchSalesReport(params: SalesReportParams, signal?: AbortSignal) {
  const { data } = await api.get<SalesReport>('/reports/sales', { params, signal });

  return data;
}

/**
 * Downloads the CSV.
 *
 * A plain link cannot carry the bearer token, so the file is fetched as a blob
 * and handed to a temporary object URL — the token never ends up in a query
 * string that would be logged by a proxy.
 */
export async function downloadSalesCsv(params: SalesReportParams) {
  const response = await api.get('/reports/sales.csv', {
    params,
    responseType: 'blob',
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  });

  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `dealflow360-sales-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
