'use client';
import { useTranslations } from 'next-intl';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, SESSION_EXPIRED_EVENT } from '@/lib/api/client';
import { DEMO_SESSION_END_EVENT } from '@/features/demo-request/api/demo-sessions';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setStoredUser,
  setTokens,
  type StoredUser,
} from './storage';

interface ProfileResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  userType: string;
  role: string | null;
  permissions: string[];
  createdAt: string;
  isApproved?: boolean | null;
  kycStatus?: string | null;
  parentAgentId?: string | null;
  preferredCurrency?: string | null;
}

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  acceptTerms: boolean;
}

interface AuthResponse {
  user: StoredUser;
  accessToken?: string;
  refreshToken?: string;
}

interface AuthContextValue {
  user: StoredUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isAgentApproved: boolean;
  agentKycStatus: string | null;
  isSubAgent: boolean;
  parentAgentId: string | null;
  isAuthLoading: boolean;
  preferredCurrency: string | null;
  preferredLanguage: string | null;
  login: (input: LoginInput) => Promise<StoredUser>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  refreshPermissions: () => Promise<void>;
  /** Set auth state after external registration (e.g. agent register bypasses context) */
  hydrateUser: (user: StoredUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  // Hydration-safe init: first render is ALWAYS logged-out (matches the
  // server HTML exactly — no #418). Storage restore happens in the mount
  // effect below, one frame later. Client-side navigations keep context.
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthCookieSet, setIsAuthCookieSet] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiRequest<ProfileResponse>('/auth/me', { auth: true });
      const storedUser: StoredUser = { ...res, permissions: res.permissions ?? [] };
      setStoredUser(storedUser);
      setUser(storedUser);
      setPermissions(res.permissions ?? []);
      return storedUser;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // Restore persisted session first (mount-only, post-hydration), then
    // validate. Guests (nothing stored) resolve immediately.
    const stored = getStoredUser();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional storage→state hydration on mount (fixes React #418).
      setUser(stored);
      setPermissions(stored.permissions ?? []);
      setIsAuthCookieSet(true);
    }
    const hasRefreshToken = !!getRefreshToken();
    if (!hasRefreshToken && !stored) {
      setIsAuthLoading(false);
      return;
    }

    // Validate the session (background revalidation when a user was already
    // restored from storage — the UI is already usable while this runs)
    let cancelled = false;
    void (async () => {
      try {
        const storedUser = await refreshProfile();
        if (cancelled) return;
        if (storedUser) setIsAuthCookieSet(true);
      } catch {
        if (cancelled) return;
        clearTokens();
        setUser(null);
        setPermissions([]);
        setIsAuthCookieSet(true);
      } finally {
        if (!cancelled) setIsAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshProfile]);

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: input,
      });
      if (res.accessToken) {
        setTokens(res.accessToken, res.refreshToken ?? '');
      }
      setStoredUser(res.user);
      setUser(res.user);
      setPermissions(res.user.permissions ?? []);
      if (res.user.preferredCurrency && typeof window !== 'undefined') {
        localStorage.setItem('travelsota_currency', res.user.preferredCurrency);
      }
      if (res.user.preferredLanguage && typeof window !== 'undefined') {
        localStorage.setItem('travelsota_language', res.user.preferredLanguage);
      }
      return res.user;
    },
    [],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await apiRequest<AuthResponse>('/auth/register', {
        method: 'POST',
        body: input,
      });
      if (res.accessToken) {
        setTokens(res.accessToken, res.refreshToken ?? '');
      }
      setStoredUser(res.user);
      setUser(res.user);
      setPermissions(res.user.permissions ?? []);
      if (res.user.preferredCurrency && typeof window !== 'undefined') {
        localStorage.setItem('travelsota_currency', res.user.preferredCurrency);
      }
      if (res.user.preferredLanguage && typeof window !== 'undefined') {
        localStorage.setItem('travelsota_language', res.user.preferredLanguage);
      }
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiRequest<{ accessToken?: string; refreshToken?: string }>(
        '/auth/refresh',
        { method: 'POST' },
      );
      if (res.accessToken) {
        setTokens(res.accessToken, res.refreshToken ?? '');
      }
      return true;
    } catch {
      clearTokens();
      setUser(null);
      setPermissions([]);
      return false;
    }
  }, []);

  const refreshPermissions = useCallback(async () => {
    await refreshProfile();
  }, [refreshProfile]);

  // Global session-expiry listener: a 401 + failed refresh anywhere in the app
  // (e.g. demo credential reset) forces sign-out and redirect.
  useEffect(() => {
    const handleSessionExpired = () => {
      // Guests never had a session — a stray 401 must not bounce them to /signin
      // (e.g. an auth-gated widget firing while they browse or check out).
      const hadSession = Boolean(getAccessToken() || getRefreshToken());
      clearTokens();
      setUser(null);
      setPermissions([]);
      if (hadSession) router.push('/signin');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
      });
    } catch {
      // ignore server error during logout
    }
    if (typeof window !== 'undefined') {
      // End any tracked demo session (tracker listens on window).
      window.dispatchEvent(new Event(DEMO_SESSION_END_EVENT));
    }
    clearTokens();
    setUser(null);
    setPermissions([]);
    router.push('/');
  }, [router]);

  const hydrateUser = useCallback((user: StoredUser) => {
    setStoredUser(user);
    setUser(user);
    setPermissions(user.permissions ?? []);
    if (user.preferredCurrency && typeof window !== 'undefined') {
      localStorage.setItem('travelsota_currency', user.preferredCurrency);
    }
    if (user.preferredLanguage && typeof window !== 'undefined') {
      localStorage.setItem('travelsota_language', user.preferredLanguage);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await apiRequest('/auth/logout-all', {
        method: 'POST',
        auth: true,
      });
    } catch {
      // ignore server error during logout
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(DEMO_SESSION_END_EVENT));
    }
    clearTokens();
    setUser(null);
    setPermissions([]);
    router.push('/');
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      permissions,
      isAuthenticated: !!user,
      isAdmin: user?.userType === 'STAFF',
      isAgent: user?.userType === 'AGENT',
      isAgentApproved: user?.userType === 'AGENT' ? (user?.isApproved ?? false) : true,
      agentKycStatus: user?.userType === 'AGENT' ? (user?.kycStatus ?? null) : null,
      isSubAgent: user?.userType === 'AGENT' ? !!user?.parentAgentId : false,
      parentAgentId: user?.userType === 'AGENT' ? (user?.parentAgentId ?? null) : null,
      isAuthLoading,
      preferredCurrency: user?.preferredCurrency ?? null,
      preferredLanguage: user?.preferredLanguage ?? null,
      login,
      register,
      logout,
      logoutAll,
      refreshSession,
      refreshPermissions,
      hydrateUser,
    }),
    [user, permissions, isAuthLoading, login, register, logout, logoutAll, refreshSession, refreshPermissions, hydrateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
