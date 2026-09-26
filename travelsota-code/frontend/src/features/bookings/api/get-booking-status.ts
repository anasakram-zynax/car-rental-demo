import { apiRequest } from '@/lib/api/client';

export interface UnifiedBookingStatusResponse {
  bookingId: string;
  type: 'flight' | 'hotel';
  status: string;
  statusLabel: string;
  isTerminal: boolean;
  isFailure: boolean;
  isPending: boolean;
  isBooked: boolean;
  provider: string;
  reference: string | null;
  // Flight-specific
  itinerary?: {
    from: string;
    to: string;
    departureDate: string;
    returnDate?: string;
  };
  // Hotel-specific
  hotelConfirmationNumber?: string | null;
  hotel?: Record<string, unknown> | null;
  message?: string | null;
  // Shared
  pricing: {
    totalAmount: number;
    currency: string;
  };
  createdAt: string;
  updatedAt: string;
}

export function getUnifiedBookingStatus(
  bookingId: string,
): Promise<UnifiedBookingStatusResponse> {
  return apiRequest<UnifiedBookingStatusResponse>(
    `/bookings/${bookingId}/status`,
    { auth: true },
  );
}
