import { api } from './api';

/**
 * Email verification and password reset.
 *
 * Every response here is deliberately vague about whether an address is
 * registered — the server answers the same way either way, and the UI must not
 * undo that by rendering a different message.
 */

export async function verifyEmail(email: string, code: string) {
  const { data } = await api.post<{ verified: boolean; message: string }>(
    '/auth/verify-email',
    { email, code },
  );

  return data;
}

export async function resendVerification(email: string) {
  const { data } = await api.post<{ sent: boolean; message: string }>(
    '/auth/resend-verification',
    { email },
  );

  return data;
}

export async function forgotPassword(email: string) {
  const { data } = await api.post<{ sent: boolean; message: string }>(
    '/auth/forgot-password',
    { email },
  );

  return data;
}

/** Checks a reset link before showing the form, so a dead link says so early. */
export async function checkResetToken(token: string, signal?: AbortSignal) {
  const { data } = await api.get<{ email: string; firstName: string }>(
    `/auth/reset-password/${token}`,
    { signal },
  );

  return data;
}

export async function resetPassword(token: string, password: string) {
  const { data } = await api.post<{ reset: boolean; message: string }>(
    '/auth/reset-password',
    { token, password },
  );

  return data;
}

/* ── development outbox ─────────────────────────────── */

export type OutboxMessage = {
  id: string;
  to: string;
  subject: string;
  text: string;
  sentAt: string;
  via: 'smtp' | 'outbox';
};

/**
 * Reads mail captured when SMTP is not configured. Used by the dev-only hint on
 * the verification screen so the flow is walkable without a mail server.
 */
export async function fetchOutbox() {
  const { data } = await api.get<{ mailConfigured: boolean; messages: OutboxMessage[] }>(
    '/dev/outbox',
  );

  return data;
}
