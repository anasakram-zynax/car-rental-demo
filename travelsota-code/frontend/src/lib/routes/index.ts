export const ROUTES = {
  FLIGHTS: {
    SEARCH: '/flights/search' as const,
    PREVIEW: '/flights/bookings/preview' as const,
    CONFIRM: '/flights/bookings/confirm' as const,
    BOOKING: (id: string) => `/flights/bookings/${id}`,
    ANCILLARY_PRICE: '/flights/ancillaries/price' as const,
    CHECKOUT: '/flights/bookings/checkout' as const,
    DETAILS: (offerId: string) => `/flights/offers/${encodeURIComponent(offerId)}/details`,
    SNAPSHOT_DETAILS: (snapshotId: string) => `/flights/offers/snapshots/${encodeURIComponent(snapshotId)}`,
  },
  HOTELS: {
    SEARCH: '/hotels/search' as const,
    CHECK_RATE: '/hotels/check-rate' as const,
    VALIDATE_RATE: '/hotels/rates/validate' as const,
    DETAILS: '/hotels/details' as const,
    DESTINATIONS: '/hotels/destinations' as const,
    SUGGEST_HOTELS: '/hotels/suggest-hotels' as const,
    BOOK: '/hotels/book' as const,
    PREVIEW: '/hotels/bookings/preview' as const,
    CHECKOUT: '/hotels/bookings/checkout' as const,
    BOOKING: (id: string) => `/hotels/bookings/${id}`,
    CANCEL: (id: string) => `/hotels/bookings/${id}/cancel` as const,
    CANCEL_ESTIMATE: (id: string) => `/hotels/bookings/${id}/cancel-estimate` as const,
    BOOKING_DETAILS: (rateId: string) => `/booking/hotels/${rateId}/details`,
  },
  ADMIN: {
    SETTINGS: '/admin/settings' as const,
  },
  PAYMENTS: {
    CONFIRM: '/payments/confirm' as const,
  },
  BOOKING: {
    STATUS: (id: string) => `/booking/${id}/status`,
  },
  HEALTH: '/health' as const,
  AUTOCOMPLETE: {
    TRAVEL: '/autocomplete/travel' as const,
  },
} as const;
