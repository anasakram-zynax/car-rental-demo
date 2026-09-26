'use client';

import { useAuth } from './useAuth';

export function useBookingMode() {
  const { user, isAgent } = useAuth();

  const mode = isAgent ? 'agent' : 'customer';

  return {
    mode: mode as 'customer' | 'agent',
    isAgentBooking: isAgent,
    isCustomerBooking: !isAgent,
    user,
  };
}
