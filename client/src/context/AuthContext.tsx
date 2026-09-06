import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  clearAuth,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  type AuthResult,
  type PublicUser,
  type UserRole,
} from '../util/api';

export type AuthContextValue = {
  user: PublicUser | null;
  /** True until the stored token has been checked against the server. */
  loading: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  signup: (input: SignupInput) => Promise<PublicUser>;
  /**
   * Re-reads the signed-in user from the server. Needed after something changes
   * server-side that the stored copy cannot know about — verifying an email
   * being the obvious one.
   */
  refresh: () => Promise<PublicUser | null>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
};

type SignupInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed from localStorage so a reload paints the shell immediately; the
  // /auth/me call below confirms or clears it a moment later.
  const [user, setUser] = useState<PublicUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(() => getToken() !== null);

  useEffect(() => {
    if (getToken() === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    api
      .get<{ user: PublicUser }>('/auth/me')
      .then(({ data }) => {
        if (cancelled) return;
        setUser(data.user);
        setStoredUser(data.user);
      })
      .catch(() => {
        // A 401 already cleared storage in the response interceptor.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResult>('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const { data } = await api.post<AuthResult>('/auth/signup', input);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ user: PublicUser }>('/auth/me');

      setUser(data.user);
      setStoredUser(data.user);

      return data.user;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      signup,
      refresh,
      logout,
      hasRole: (...roles: UserRole[]) => (user ? user.roles.some((r) => roles.includes(r)) : false),
    }),
    [user, loading, login, signup, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
