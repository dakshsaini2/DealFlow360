import { api } from './api';

export type AlertType =
  | 'STALLED'
  | 'DISCOUNT_ANOMALY'
  | 'DELIVERY_SLIPPAGE'
  | 'MARGIN_EROSION';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AnomalyAlert = {
  id: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  thresholdValue: number | null;
  actualValue: number | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  resolver: { id: string; firstName: string; lastName: string } | null;
  quotation: {
    id: string;
    quoteNumber: string;
    status: string;
    approvalStatus: string;
    grandTotal: number;
    currencyCode: string;
    blendedRiskScore: number | null;
    updatedAt: string;
    customer: { id: string; name: string };
    salesRep: { id: string; firstName: string; lastName: string };
  };
};

export type DealHealthRow = {
  id: string;
  healthScore: number;
  healthStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
  daysInactive: number;
  discountRiskScore: number;
  fulfillmentRiskScore: number;
  billingRiskScore: number;
  lastActivityAt: string | null;
  calculatedAt: string;
  quotation: {
    id: string;
    quoteNumber: string;
    status: string;
    grandTotal: number;
    currencyCode: string;
    customer: { id: string; name: string };
    salesRep: { id: string; firstName: string; lastName: string };
  };
};

export type HealthDashboard = {
  alerts: AnomalyAlert[];
  dealHealth: DealHealthRow[];
  counts: {
    stalled: number;
    discountAnomalies: number;
    deliverySlippage: number;
    atRisk: number;
  };
  thresholds: {
    stalledDays: number;
    anomalyMultiplier: number;
    riskThreshold: number;
  };
};

export async function fetchHealthDashboard(
  params: { scope?: 'all' | 'mine'; alertType?: AlertType; status?: string } = {},
  signal?: AbortSignal,
) {
  const { data } = await api.get<HealthDashboard>('/deal-health/dashboard', {
    params,
    signal,
  });

  return data;
}

export async function actOnAlert(
  alertId: string,
  input: { action: 'NUDGE' | 'ESCALATE' | 'DISMISS'; note?: string },
) {
  const { data } = await api.post<{
    alertId: string;
    action: string;
    quotationId: string;
  }>(`/deal-health/alerts/${alertId}/act`, input);

  return data;
}

/* ── display helpers ────────────────────────────────── */

export const SEVERITY_TONE: Record<AlertSeverity, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> =
  {
    LOW: 'neutral',
    MEDIUM: 'amber',
    HIGH: 'red',
    CRITICAL: 'red',
  };

export const HEALTH_TONE: Record<
  DealHealthRow['healthStatus'],
  'neutral' | 'brand' | 'green' | 'amber' | 'red'
> = {
  HEALTHY: 'green',
  AT_RISK: 'amber',
  CRITICAL: 'red',
};

export const ALERT_LABELS: Record<AlertType, string> = {
  STALLED: 'Stalled deal',
  DISCOUNT_ANOMALY: 'Discount anomaly',
  DELIVERY_SLIPPAGE: 'Delivery slippage',
  MARGIN_EROSION: 'Margin erosion',
};
