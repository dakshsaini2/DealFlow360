import axios, { AxiosError, AxiosHeaders } from 'axios';

const TOKEN_KEY = 'dealflow360.token';
const USER_KEY = 'dealflow360.user';

export const USER_ROLES = ['ADMIN', 'SALES_MANAGER', 'FINANCE', 'SALES_REP', 'CUSTOMER'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** A user can hold several roles — a manager is usually a rep too. */
  roles: UserRole[];
};

/** Mirrors the server's `requireRole`: true when the user holds any of them. */
export function hasAnyRole(user: PublicUser | null, roles: readonly UserRole[]): boolean {
  return user ? user.roles.some((role) => roles.includes(role)) : false;
}

export type AuthResult = {
  token: string;
  user: PublicUser;
};

/** The error envelope produced by the server's error middleware. */
type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

/* ── Token storage ──────────────────────────────────── */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode, blocked cookies) — stay logged in for this tab only */
  }
}

export function getStoredUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: PublicUser) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

/** Drops every trace of the session. Called on logout and on any 401. */
export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/* ── Axios instance ─────────────────────────────────── */

export const api = axios.create({
  // Defaults to the Vite dev proxy (see vite.config.ts); override with
  // VITE_API_URL when the API lives on another origin.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

/** Attaches the stored token as a bearer header on every outgoing request. */
api.interceptors.request.use((config) => {
  const token = getToken();

  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }

  return config;
});

/**
 * Persists the token from any response that carries one (signup, login, and
 * anything else that re-issues one) and wipes the session on a 401.
 */
api.interceptors.response.use(
  (response) => {
    const data = response.data as Partial<AuthResult> | undefined;

    if (data && typeof data.token === 'string' && data.token) {
      setToken(data.token);
    }

    if (data?.user) {
      setStoredUser(data.user);
    }

    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearAuth();
    }

    return Promise.reject(error);
  },
);

/* ── Helpers ────────────────────────────────────────── */

/** Turns any thrown error into a message that is safe to show a user. */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : fallback;
  }

  const body = err.response?.data as ApiErrorBody | undefined;
  const details = body?.error?.details;

  // Validation errors carry a list of specific problems — those read better
  // than the generic "Invalid credentials payload".
  if (Array.isArray(details) && details.length > 0) {
    return details.join(', ');
  }

  if (body?.error?.message) {
    return body.error.message;
  }

  if (!err.response) {
    return 'Cannot reach the server. Is it running?';
  }

  return fallback;
}

export default api;
