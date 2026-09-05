import { api } from './api';

export type StepState = 'APPROVED' | 'CURRENT' | 'WAITING' | 'BLOCKED';

export type ApprovalStep = {
  id: string;
  stepOrder: number;
  role: string;
  isRequired: boolean;
  state: StepState;
  approvers: { id: string; firstName: string; lastName: string }[];
  action: {
    action: string;
    comment: string | null;
    reason: string | null;
    actedAt: string;
    approver: { id: string; firstName: string; lastName: string };
  } | null;
};

export type ApprovalDetail = {
  approval: {
    id: string;
    status: string;
    riskScore: number;
    triggerReason: string | null;
    startedAt: string;
    completedAt: string | null;
    policy: {
      id: string;
      name: string;
      description: string | null;
      riskMin: number;
      riskMax: number;
    } | null;
  } | null;
  steps: ApprovalStep[];
  currentStep: ApprovalStep | null;
  canAct: boolean;
  blockedReason?: string;
};

export type QueueRow = {
  quotation: {
    id: string;
    quoteNumber: string;
    status: string;
    approvalStatus: string;
    grandTotal: number;
    currencyCode: string;
    blendedRiskScore: number | null;
    updatedAt: string;
    customer: { id: string; name: string; customerTier: { name: string } | null };
    salesRep: { id: string; firstName: string; lastName: string };
  };
  riskScore: number;
  policyName: string | null;
  triggerReason: string | null;
  startedAt: string;
  currentStep: ApprovalStep | null;
  chain: { role: string; state: StepState; stepOrder: number }[];
  canAct: boolean;
  blockedReason?: string;
};

export type ApprovalActionType = 'APPROVE' | 'REJECT' | 'RETURN';

export async function fetchApprovalQueue(scope: 'mine' | 'all', signal?: AbortSignal) {
  const { data } = await api.get<{ data: QueueRow[] }>('/approvals', {
    params: { scope },
    signal,
  });

  return data.data;
}

export async function fetchApproval(quotationId: string, signal?: AbortSignal) {
  const { data } = await api.get<ApprovalDetail>(`/approvals/${quotationId}`, { signal });

  return data;
}

export async function actOnApproval(
  quotationId: string,
  input: { action: ApprovalActionType; comment?: string; reason?: string },
) {
  const { data } = await api.post<ApprovalDetail>(`/approvals/${quotationId}/act`, input);

  return data;
}

export const STEP_STATE_TONE: Record<StepState, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> = {
  APPROVED: 'green',
  CURRENT: 'amber',
  WAITING: 'neutral',
  BLOCKED: 'red',
};

export const INSTANCE_TONE: Record<string, 'neutral' | 'brand' | 'green' | 'amber' | 'red'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  RETURNED: 'amber',
  SUPERSEDED: 'neutral',
  CANCELLED: 'neutral',
};

export function roleLabel(role: string) {
  return role
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
