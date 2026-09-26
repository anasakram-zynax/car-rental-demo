import { apiRequest } from "@/lib/api/client";
import { ROUTES } from "@/lib/routes";

export interface HotelCheckoutHolder {
  name: string;
  surname: string;
}

export interface HotelCheckoutPax {
  roomId: string;
  type: string;
  name: string;
  surname: string;
}

export interface HotelCheckoutInput {
  rateKey: string;
  /** Provider-neutral rate identifier (preferred over rateKey) */
  rateId?: string;
  /** Search key from the search response */
  searchKey?: string;
  /** Normalized hotel ID */
  hotelId?: string;
  /** Provider key (e.g. hotelbeds, ratehawk) */
  provider?: string;
  /** Provider hotel ID */
  providerHotelId?: string;
  holder: HotelCheckoutHolder;
  clientReference: string;
  paxes: HotelCheckoutPax[];
  gateway: 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'PAY_LATER';
  /** Customer's selected charge currency (e.g. "USD"). The backend converts the
   *  supplier amount to this currency for payment. Supplier-facing API calls
   *  always use the supplier currency internally. */
  currency?: string;
  /** Total price — informational only. Backend re-validates via rate check and
   *  computes the authoritative amount server-side. */
  totalPrice?: number;
  /** Display currency for frontend rendering (e.g. "USD"). The backend converts
   * the charge amount to this currency for display purposes.
   * When omitted, the charge currency is used for display. */
  displayCurrency?: string;
  /** Check-in date for multi-night stay price calculation */
  checkIn?: string;
  /** Check-out date for multi-night stay price calculation */
  checkOut?: string;
  /** Display names stored with the booking (admin views, demo bookings). */
  hotelName?: string;
  roomName?: string;
  boardName?: string;
}

export interface HotelCheckoutResponse {
  bookingId: string;
  paymentId: string;
  amount: number;
  currency: string;
  clientSecret?: string;
  checkoutUrl?: string;
  /** Present when the server took the agent wallet branch (unified pipeline). */
  paymentMethod?: 'wallet' | 'BANK_TRANSFER' | 'PAY_LATER' | string;
  holdId?: string;
  message?: string;
}

export async function hotelCheckout(input: HotelCheckoutInput) {
  return apiRequest<HotelCheckoutResponse>(ROUTES.HOTELS.CHECKOUT, {
    method: "POST",
    body: input,
    auth: true,
  });
}
