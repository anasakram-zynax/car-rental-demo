export type HotelBookingStatus = 'pending_payment' | 'payment_processing' | 'awaiting_issue' | 'booking_in_progress' | 'booked' | 'cancelled' | 'cancellation_requested' | 'failed' | 'failed_supplier_booking' | 'failed_payment' | 'refund_pending' | 'refunded';

export interface HotelBookingEntity {
  id: string;
  publicRef?: string | null;

  // Provider metadata
  provider: string;
  status: HotelBookingStatus;

  // Search context (provider-neutral)
  searchKey: string | null;
  hotelId: string | null;
  providerHotelId: string | null;

  // Supplier identifiers (provider-neutral)
  supplierRateId: string | null;
  supplierReference: string | null;
  supplierStatus: string | null;
  supplierBookingId: string | null;
  supplierOrderId: string | null;
  supplierItemId: string | null;

  // Prebook token (RateHawk-specific)
  prebookToken: string | null;
  prebookExpiresAt: string | null;
  partnerOrderId: string | null;

  // Hotel Confirmation Number (HRN/HCN) — delayed post-booking sync
  hotelConfirmationNumber: string | null;
  hotelConfirmationStatus: string | null;
  hotelConfirmationLastCheckedAt: Date | null;
  hotelConfirmationNextCheckAt: Date | null;
  hotelConfirmationAttempts: number;

  // Customer & booking details
  holder: Record<string, any>;
  guests: Record<string, any>[] | null;
  clientReference: string;
  paxes: Record<string, any>[];

  // Pricing (provider-neutral, split supplier vs customer)
  supplierAmount: number | null;
  supplierCurrency: string | null;
  customerAmount: number | null;
  customerCurrency: string | null;
  markupAmount: number | null;
  markupSnapshot: Record<string, any> | null;
  commissionAmount: number | null;
  commissionRate: number | null;

  // Snapshots & traces
  hotelSnapshot: Record<string, any> | null;
  priceSnapshot: Record<string, any> | null;
  rateSnapshot: Record<string, any> | null;
  supplierPayload: Record<string, any> | null;
  workflowTrace: Record<string, any> | null;

  // Supplier error details
  supplierErrorCode: string | null;
  supplierErrorText: string | null;

  // Legacy Hotelbeds fields (deprecated, kept for existing records)
  /** @deprecated Use supplierRateId */
  rateKey: string;
  /** @deprecated Use supplierReference */
  hotelbedsRef: string | null;
  /** @deprecated Use supplierStatus */
  hotelbedsStatus: string | null;
  /** @deprecated Use customerAmount */
  amount: number | null;
  /** @deprecated Use customerCurrency */
  currency: string | null;

  message: string | null;
  /** Bank-transfer receipt URL (Cloudinary) for admin verification. */
  receiptUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
}

export type CreateHotelBookingInput = Omit<HotelBookingEntity, 'createdAt' | 'updatedAt'>;

export type UpdateHotelBookingInput = Partial<
  Pick<
    HotelBookingEntity,
    | 'status'
    | 'amount'
    | 'currency'
    | 'rateKey'
    | 'hotelbedsRef'
    | 'hotelbedsStatus'
    | 'hotelSnapshot'
    | 'priceSnapshot'
    | 'message'
    // New provider-neutral fields
    | 'searchKey'
    | 'hotelId'
    | 'providerHotelId'
    | 'supplierRateId'
    | 'supplierReference'
    | 'supplierStatus'
    | 'supplierBookingId'
    | 'supplierOrderId'
    | 'supplierItemId'
    | 'guests'
    | 'supplierAmount'
    | 'supplierCurrency'
    | 'customerAmount'
    | 'customerCurrency'
    | 'markupAmount'
    | 'markupSnapshot'
    | 'rateSnapshot'
    | 'supplierPayload'
    | 'workflowTrace'
    | 'supplierErrorCode'
    | 'supplierErrorText'
    | 'prebookToken'
    | 'prebookExpiresAt'
    | 'partnerOrderId'
    | 'hotelConfirmationNumber'
    | 'hotelConfirmationStatus'
    | 'hotelConfirmationLastCheckedAt'
    | 'hotelConfirmationNextCheckAt'
    | 'hotelConfirmationAttempts'
    | 'receiptUrl'
  >
>;
