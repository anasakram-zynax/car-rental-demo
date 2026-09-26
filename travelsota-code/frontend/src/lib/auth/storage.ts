'use client';

const USER_KEY = 'auth_user';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export interface StoredUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  userType: string;
  role: string | null;
  roleType?: string;
  status?: string;
  permissions?: string[];
  isApproved?: boolean | null;
  kycStatus?: string | null;
  parentAgentId?: string | null;
  preferredCurrency?: string | null;
  preferredLanguage?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  createdAt?: string;
}

// In-memory access token — survives page navigation but not full reloads.
// On reload, we fall back to the refresh token (and cookies as a secondary path).
let accessToken: string | null = null;

export function getAccessToken(): string {
  return accessToken ?? '';
}

export function setTokens(newAccessToken: string, newRefreshToken: string) {
  accessToken = newAccessToken;
  if (typeof window !== 'undefined' && newRefreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
  }
}

export function getRefreshToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearTokens() {
  accessToken = null;
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
