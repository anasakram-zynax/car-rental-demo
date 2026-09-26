import { apiRequest } from '@/lib/api/client';

// ── Types ─────────────────────────────────────────────────────

export interface CustomerProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  preferredCurrency: string | null;
  preferredLanguage: string | null;
  status: string;
  userType: string;
  createdAt: string;
}

export interface UpdateProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  preferredCurrency?: string | null;
  preferredLanguage?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface ResetTokenVerification {
  valid: boolean;
}

// ── API Functions ─────────────────────────────────────────────

/**
 * Get the current user's profile.
 */
export function getCustomerProfile(): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/auth/me', { auth: true });
}

/**
 * Update the current user's profile.
 */
export function updateCustomerProfile(input: UpdateProfileInput): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/auth/me', {
    method: 'PATCH',
    body: input,
    auth: true,
  });
}

/**
 * Change the current user's password.
 */
export function changeCustomerPassword(input: ChangePasswordInput): Promise<void> {
  return apiRequest<void>('/auth/change-password', {
    method: 'POST',
    body: input,
    auth: true,
  });
}

/**
 * Request a password reset email.
 * Always returns success (prevents email enumeration).
 */
export function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  return apiRequest<void>('/auth/forgot-password', {
    method: 'POST',
    body: input,
  });
}

/**
 * Reset password using a token from the email.
 */
export function resetPassword(input: ResetPasswordInput): Promise<void> {
  return apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: input,
  });
}

/**
 * Verify if a reset token is still valid.
 */
export function verifyResetToken(token: string): Promise<ResetTokenVerification> {
  return apiRequest<ResetTokenVerification>(`/auth/reset-password/${token}/verify`);
}
