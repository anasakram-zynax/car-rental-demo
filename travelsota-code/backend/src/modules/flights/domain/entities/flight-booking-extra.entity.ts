export type FlightBookingExtraType = 'seat' | 'baggage' | 'meal' | 'service';
export type FlightBookingExtraStatus =
  | 'selected'
  | 'quoted'
  | 'payment_pending'
  | 'payment_paid'
  | 'adding_to_supplier'
  | 'confirmed'
  | 'failed'
  | 'refunded';

export interface FlightBookingExtraEntity {
  id: string;
  bookingId: string;

  provider: string;       // 'travelport'
  contentSource: string;  // 'GDS' | 'NDC'

  type: FlightBookingExtraType;
  status: FlightBookingExtraStatus;

  label?: string;
  description?: string;

  travelerIndex?: number;
  travelerRef?: string;
  segmentRef?: string;
  segmentLabel?: string;
  productRef?: string;

  // Supplier identifiers for adding extras to workbench
  supplierCatalogOfferingsIdentifier?: string;
  supplierCatalogOfferingIdentifier?: string;
  supplierProductIdentifier?: string;
  supplierOfferIdentifier?: string;
  supplierReservationIdentifier?: string;

  amount: number;
  currency: string;

  paymentId?: string;
  supplierErrorCode?: string;
  supplierErrorMessage?: string;

  rawSupplierPayload?: Record<string, unknown>;
  rawSupplierResponse?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export type CreateFlightBookingExtraInput = Omit<
  FlightBookingExtraEntity,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateFlightBookingExtraInput = Partial<
  Pick<
    FlightBookingExtraEntity,
    | 'status'
    | 'supplierCatalogOfferingsIdentifier'
    | 'supplierCatalogOfferingIdentifier'
    | 'supplierProductIdentifier'
    | 'supplierOfferIdentifier'
    | 'supplierReservationIdentifier'
    | 'paymentId'
    | 'supplierErrorCode'
    | 'supplierErrorMessage'
    | 'rawSupplierPayload'
    | 'rawSupplierResponse'
  >
>;
