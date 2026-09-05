import { api } from './api';
import type { AuthResult } from './api';

export type PortalMember = {
  id: string;
  isPrimary: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    lastLoginAt: string | null;
  };
};

export type PortalInvite = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
  invitedBy: { id: string; firstName: string; lastName: string };
};

export type PortalAccess = {
  customer: { id: string; name: string };
  members: PortalMember[];
  invites: PortalInvite[];
};

export type InviteDetails = {
  email: string;
  firstName: string;
  lastName: string;
  customerName: string;
  expiresAt: string;
};

export async function fetchPortalAccess(customerId: string, signal?: AbortSignal) {
  const { data } = await api.get<PortalAccess>(`/customers/${customerId}/portal-access`, {
    signal,
  });

  return data;
}

/**
 * Creates the invitation. The returned token is shown exactly once — there is
 * no endpoint that reads it back, so the rep copies the link now or revokes and
 * re-invites later.
 */
export async function createPortalInvite(
  customerId: string,
  input: { email: string; firstName: string; lastName: string },
) {
  const { data } = await api.post<{
    invite: { id: string; email: string; expiresAt: string };
    invitePath: string;
    token: string;
  }>(`/customers/${customerId}/portal-invites`, input);

  return { ...data, inviteUrl: `${window.location.origin}${data.invitePath}` };
}

export async function revokePortalInvite(customerId: string, inviteId: string) {
  const { data } = await api.delete<PortalAccess>(
    `/customers/${customerId}/portal-invites/${inviteId}`,
  );

  return data;
}

export async function revokePortalAccess(customerId: string, userId: string) {
  const { data } = await api.delete<PortalAccess>(
    `/customers/${customerId}/portal-access/${userId}`,
  );

  return data;
}

/* ── the public half ────────────────────────────────── */

export async function fetchInvite(token: string, signal?: AbortSignal) {
  const { data } = await api.get<InviteDetails>(`/auth/invites/${token}`, { signal });

  return data;
}

export async function acceptInvite(token: string, password: string) {
  const { data } = await api.post<AuthResult>(`/auth/invites/${token}/accept`, { password });

  return data;
}
