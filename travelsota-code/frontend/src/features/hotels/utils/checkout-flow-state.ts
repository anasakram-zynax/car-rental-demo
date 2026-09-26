"use client";

const FLOW_STATE_KEY = "checkout_flow_state";

export interface GuestFormState {
  name: string;
  lastName: string;
  age: string;
  title: string;
}

export type HotelPaymentMethod = "stripe" | "paypal" | "bank_transfer" | "pay_later" | string;

export interface CheckoutFlowState {
  step: "details" | "payment" | "confirm";
  paymentId: string;
  bookingId: string;
  hotelName: string;
  roomName: string;
  paymentMethod: HotelPaymentMethod;
  rateId: string;
  searchKey: string;
  bookingType: "hotel";
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  isAgent: boolean;
  formState: {
    isGuest: boolean;
    holderTitle: string;
    holderName: string;
    holderLastName: string;
    holderEmail: string;
    holderPhone: string;
    holderCountryCode: string;
    bookingForSomeoneElse: boolean;
    guests: GuestFormState[];
    specialRequests: string;
    agreeTerms: boolean;
  };
}

const EMPTY_FORM_STATE: CheckoutFlowState["formState"] = {
  isGuest: true,
  holderTitle: "",
  holderName: "",
  holderLastName: "",
  holderEmail: "",
  holderPhone: "",
  holderCountryCode: "",
  bookingForSomeoneElse: false,
  guests: [],
  specialRequests: "",
  agreeTerms: false,
};

export function saveFlowState(state: CheckoutFlowState): void {
  try {
    sessionStorage.setItem(FLOW_STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function getFlowState(): CheckoutFlowState | null {
  try {
    const raw = sessionStorage.getItem(FLOW_STATE_KEY);
    if (raw) return JSON.parse(raw) as CheckoutFlowState;
  } catch {
    /* ignore parse errors */
  }
  return null;
}

export function getFlowStep(): CheckoutFlowState["step"] {
  return getFlowState()?.step ?? "details";
}

export function clearFlowState(): void {
  try {
    sessionStorage.removeItem(FLOW_STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function saveFormState(form: CheckoutFlowState["formState"]): void {
  const existing = getFlowState();
  if (existing) {
    saveFlowState({ ...existing, formState: form });
  }
}

export function getFormState(): CheckoutFlowState["formState"] {
  return getFlowState()?.formState ?? EMPTY_FORM_STATE;
}

export function advanceToPayment(checkoutData: {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  hotelName: string;
  roomName: string;
  paymentMethod: HotelPaymentMethod;
  rateId: string;
  searchKey: string;
  isAgent?: boolean;
}): void {
  const existing = getFlowState();
  saveFlowState({
    step: "payment",
    paymentId: checkoutData.paymentId,
    bookingId: checkoutData.bookingId,
    bookingType: "hotel",
    amount: checkoutData.amount,
    currency: checkoutData.currency,
    clientSecret: checkoutData.clientSecret,
    checkoutUrl: checkoutData.checkoutUrl,
    hotelName: checkoutData.hotelName,
    roomName: checkoutData.roomName,
    paymentMethod: checkoutData.paymentMethod,
    rateId: checkoutData.rateId,
    searchKey: checkoutData.searchKey,
    isAgent: checkoutData.isAgent ?? false,
    formState: existing?.formState ?? EMPTY_FORM_STATE,
  });
}

export function advanceToConfirm(): void {
  const existing = getFlowState();
  if (existing) {
    saveFlowState({
      ...existing,
      step: "confirm",
    });
  }
}

export function goBackToDetails(): void {
  const existing = getFlowState();
  if (existing) {
    saveFlowState({
      ...existing,
      step: "details",
    });
  }
}
