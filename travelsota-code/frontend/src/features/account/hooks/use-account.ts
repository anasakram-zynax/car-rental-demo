import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCustomerProfile,
  updateCustomerProfile,
  changeCustomerPassword,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  type UpdateProfileInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '../api/customer-account';

// ── Query Keys ────────────────────────────────────────────────

export const accountKeys = {
  all: ['account'] as const,
  profile: () => [...accountKeys.all, 'profile'] as const,
};

// ── Profile ───────────────────────────────────────────────────

export function useCustomerProfile() {
  return useQuery({
    queryKey: accountKeys.profile(),
    queryFn: getCustomerProfile,
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateCustomerProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.profile() });
    },
  });
}

// ── Password ──────────────────────────────────────────────────

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changeCustomerPassword(input),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => forgotPassword(input),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => resetPassword(input),
  });
}

export function useVerifyResetToken(token: string) {
  return useQuery({
    queryKey: [...accountKeys.all, 'reset-token', token],
    queryFn: () => verifyResetToken(token),
    enabled: !!token,
    retry: false,
  });
}
