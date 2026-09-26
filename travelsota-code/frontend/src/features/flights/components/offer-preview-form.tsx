"use client";
import { useTranslations } from 'next-intl';


import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFlightCheckout } from "@/features/flights/hooks";
import { validateTravelerInput } from "@/features/flights/utils/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/context/CurrencyContext";
import { AncillarySelectionPanel } from "./ancillary-selection-panel";
import { ErrorBox } from "@/components/ui/state/error-box";
import { clearOffer } from "@/lib/offer-bridge";
import type { PaymentGateway, AncillarySelectionsInput, AncillarySeatInput, AncillaryBaggageInput, AncillaryServiceInput, AncillaryMealInput, PriceBreakdown } from "@/features/flights/api/checkout-booking";
import { PriceBreakdownNote } from "@/components/shared/price-breakdown-note";
import { getEnabledGateways, gatewayLabel, toCheckoutGateway, isManualGatewayKey } from "@/features/payments/api/get-gateway-config";
import { getCustomerWalletBalance } from "@/features/wallet/api/customer-wallet";
import type { CustomerWalletBalance } from "@/features/wallet/api/customer-wallet";
import { getWalletBalance } from "@/features/wallet/api/agent-wallet";
import type { WalletBalance } from "@/features/wallet/api/agent-wallet";
import type { GatewayListItem } from "@/features/payments/api/get-gateway-config";
import { getAgentAccess, isAllowed } from "@/features/agent/api/agent-access";
import { decodeSeat, decodeBaggage, decodeService, decodeMeal, parsePriceText, sumAncillaryPrices } from "@/features/flights/utils/ancillary-utils";
import { createCheckoutSession, type CheckoutSessionResponse } from "@/features/flights/api/ancillaries";
import { BankTransferIcon, PayLaterIcon } from "@/components/booking/payment-method-icons";
import type { MarkedUpOffer } from '@/features/agent/api/agent-bookings';

import { refreshAuthToken } from '@/lib/api/client';

interface Props {
  offerId: string;
  from?: string;
  to?: string;
  departureAt?: string;
  arrivalAt?: string;
  price?: string;
  currency?: string;
  productId?: string;
  productIds?: string[];
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  catalogUuid?: string;
  offeringIdentifierValue?: string;
  brandOfferingId?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  returnDate?: string;
  legs?: Array<{ origin: string; destination: string; departureDate: string }>;
  travelerCount?: number;
  searchKey?: string;
  agentOriginalPrice?: number;
  agentMarkedUpPrice?: number;
  agentMarkupPercent?: number;
  /** @default 'customer' */
  mode?: 'customer' | 'agent';
  /** Provider key — used to adjust UI for non-Travelport offers. @default 'travelport' */
  provider?: string;
}

type TravelerDraft = {
  givenName: string;
  surname: string;
  gender: 'Male' | 'Female';
  birthDate: string;
  phoneCountryCode: string;
  phoneNumber: string;
  email: string;
};

function formatTime(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(dep?: string, arr?: string): string {
  if (!dep || !arr) return '';
  const diff = new Date(arr).getTime() - new Date(dep).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function OfferPreviewForm(props: Props) {
  const t = useTranslations('Booking');
  const { formatPrice, convertAmount, selectedCurrency } = useCurrency();
  const { isAgent: isSignedInAgent, isAuthenticated, isAdmin } = useAuth();
  const isCustomer = isAuthenticated && !isSignedInAgent && !isAdmin;
  const isAgentMode = props.mode === 'agent' || isSignedInAgent;
  const isDuffle = props.provider === 'duffel';
  const currencyCode = props.currency ?? 'USD';
  const [productId, setProductId] = useState(props.productId ?? props.productIds?.[0] ?? "");
  const [catalogUuid, setCatalogUuid] = useState(props.catalogUuid ?? "");
  const [seatProductIds, setSeatProductIds] = useState<string[]>([]);
  const [baggageProductIds, setBaggageProductIds] = useState<string[]>([]);
  const [serviceProductIds, setServiceProductIds] = useState<string[]>([]);
  const [mealSelectionIds, setMealSelectionIds] = useState<string[]>(() =>
    Array.from({ length: Math.max(props.travelerCount ?? 1, 1) }, () => ''),
  );
  const [travelers, setTravelers] = useState<TravelerDraft[]>(() =>
    Array.from({ length: Math.max(props.travelerCount ?? 1, 1) }, () => ({
      givenName: "",
      surname: "",
      gender: "Male" as 'Male' | 'Female',
      birthDate: "",
      phoneCountryCode: "",
      phoneNumber: "",
      email: "",
    })),
  );
  const [gateway, setGateway] = useState<PaymentGateway>('STRIPE');
  const [agentGateway, setAgentGateway] = useState<'stripe' | 'paypal' | 'bank_transfer' | 'pay_later'>('stripe');
  const [error, setError] = useState<string | null>(null);
  const [availableGateways, setAvailableGateways] = useState<GatewayListItem[]>([]);
  const [gatewaysLoaded, setGatewaysLoaded] = useState(false);
  const [showProductFields, setShowProductFields] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card'>('wallet');
  const [payWithWallet, setPayWithWallet] = useState(false);
  const [customerWallet, setCustomerWallet] = useState<CustomerWalletBalance | null>(null);
  const [agentWallet, setAgentWallet] = useState<WalletBalance | null>(null);
  const [isAgentSubmitting, setIsAgentSubmitting] = useState(false);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<CheckoutSessionResponse | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();
  const toast = useToast();
  const checkoutMutation = useFlightCheckout();

  const fallbackAgentMarkups = useMemo<MarkedUpOffer | null>(() => {
    if (props.agentMarkedUpPrice == null || Number.isNaN(Number(props.agentMarkedUpPrice))) {
      return null;
    }

    return {
      originalPrice: props.agentOriginalPrice ?? Number(props.price ?? 0),
      markedUpPrice: Number(props.agentMarkedUpPrice),
      markupPercent: props.agentMarkupPercent ?? 0,
      appliedRules: [],
      offer: {},
    };
  }, [props.agentMarkedUpPrice, props.agentOriginalPrice, props.agentMarkupPercent, props.price]);
  // URL params (fallback) are more durable than sessionStorage — prefer them when available.
  const effectiveAgentMarkups = fallbackAgentMarkups;

  useEffect(() => {
    getEnabledGateways().then(async (gateways) => {
      let enabled = gateways.filter((g) => g.enabled);
      // Agent gateway restriction (backend enforces too): hide disallowed methods.
      if (isAgentMode && isAuthenticated) {
        try {
          const access = await getAgentAccess();
          const allow = access?.allowedGateways;
          if (allow && allow.length > 0) enabled = enabled.filter((g) => isAllowed(allow, g.gateway));
        } catch { /* fail-open: backend still enforces */ }
      }
      setAvailableGateways(enabled);
      setGatewaysLoaded(true);
      if (enabled.length === 0) return;
      if (isAgentMode) {
        // Agent card sub-options follow the same enabled list (incl. manual methods).
        const keys = enabled.map((g) => g.gateway);
        setAgentGateway((prev) => (keys.includes(prev) ? prev : keys[0]));
      } else {
        const first = enabled[0].gateway.toUpperCase() as PaymentGateway;
        setGateway(first);
      }
    }).catch(() => {
      setGatewaysLoaded(true);
    });
  }, [isAgentMode, isAuthenticated]);

  useEffect(() => {
    if (!isCustomer) return;
    getCustomerWalletBalance().then(setCustomerWallet).catch(() => {});
  }, [isCustomer]);
  useEffect(() => {
    if (!isAgentMode) return;
    getWalletBalance().then(setAgentWallet).catch(() => {});
  }, [isAgentMode]);
  // ─── Computed pricing ───
  const seatPrice = useMemo(() => sumAncillaryPrices(seatProductIds, decodeSeat), [seatProductIds]);
  const baggagePrice = useMemo(() => sumAncillaryPrices(baggageProductIds, decodeBaggage), [baggageProductIds]);
  const mealPrice = useMemo(() => sumAncillaryPrices(mealSelectionIds, decodeMeal), [mealSelectionIds]);
  const servicePrice = useMemo(() => sumAncillaryPrices(serviceProductIds, decodeService), [serviceProductIds]);
  const baseFare = Number(props.price ?? 0);
  const totalWithAncillaries = baseFare + seatPrice + baggagePrice + mealPrice + servicePrice;
  const customerWalletCurrency = customerWallet?.currency ?? selectedCurrency.code;
  const customerWalletTotal = customerWallet ? customerWallet.walletBalance + (customerWallet.creditAvailable ?? 0) : 0;
  const customerWalletTotalInSelected = customerWalletCurrency === selectedCurrency.code ? customerWalletTotal : convertAmount(customerWalletTotal, customerWalletCurrency);
  const totalInSelected = currencyCode === selectedCurrency.code ? totalWithAncillaries : convertAmount(totalWithAncillaries, currencyCode);
  const customerWalletSufficient = customerWallet ? customerWalletTotalInSelected >= totalInSelected : false;
  const showCustomerWallet = isCustomer && !!customerWallet && customerWallet.walletBalance > 0;
  // Agent wallet vs agent charge (marked-up when present) — convert-then-compare in selected currency.
  const agentChargeAmount = effectiveAgentMarkups?.markedUpPrice ?? totalWithAncillaries;
  const agentChargeInSelected = currencyCode === selectedCurrency.code ? agentChargeAmount : convertAmount(agentChargeAmount, currencyCode);
  const agentWalletCurrency = agentWallet?.currency ?? selectedCurrency.code;
  const agentWalletTotal = agentWallet ? agentWallet.walletBalance + agentWallet.creditAvailable : 0;
  const agentWalletTotalInSelected = agentWalletCurrency === selectedCurrency.code ? agentWalletTotal : convertAmount(agentWalletTotal, agentWalletCurrency);
  const agentWalletSufficient = agentWallet ? agentWalletTotalInSelected >= agentChargeInSelected : false;

  const departureDate = props.departureAt?.split("T")[0] ?? new Date().toISOString().slice(0, 10);
  const returnDate = props.tripType === "round_trip" && props.returnDate?.trim() ? props.returnDate : undefined;
  const duration = formatDuration(props.departureAt, props.arrivalAt);
  const travelerNames = useMemo(() => travelers.map((t) => `${t.givenName} ${t.surname}`.trim() || undefined).filter(Boolean) as string[], [travelers]);

  function updateTraveler<K extends keyof (typeof travelers)[number]>(index: number, key: K, value: (typeof travelers)[number][K]) {
    setTravelers((current) => current.map((traveler, travelerIndex) =>
      travelerIndex === index ? { ...traveler, [key]: value } : traveler,
    ));
  }

  function buildTravelerPayload() {
    return travelers.map((traveler, index) => ({
      ...traveler,
      passengerTypeCode: "ADT" as const,
    }));
  }

  /** Convert currently selected seat IDs into structured ancillary format */
  function buildStructuredAncillarySeats(): AncillarySeatInput[] {
    return seatProductIds
      .map((id, index) => {
        const decoded = decodeSeat(id);
        if (!decoded) return null;
        const ancillaryProductId = decoded.ancillaryProductId || decoded.seat;
        const price = parsePriceText(decoded.priceText);
        const travelerIndex = decoded.passengerIndex ?? index;
        return {
          type: 'seat' as const,
          travelerIndex,
          travelerRef: `travelerRefId_${travelerIndex + 1}`,
          segmentRef: 'segment_1',
          seatNumber: decoded.seat,
          ancillaryProductId,
          catalogOfferingsIdentifier: decoded.catalogOfferingsIdentifier,
          catalogOfferingIdentifierValue: decoded.catalogOfferingIdentifierValue,
          price: { amount: price.amount, currency: price.currency },
        } as AncillarySeatInput;
      })
      .filter((s): s is AncillarySeatInput => s !== null);
  }

  /** Convert currently selected baggage IDs into structured ancillary format */
  function buildStructuredAncillaryBaggage(): AncillaryBaggageInput[] {
    return baggageProductIds
      .map((id) => {
        const decoded = decodeBaggage(id);
        if (!decoded) return null;
        const price = decoded.priceText ? parsePriceText(decoded.priceText) : { amount: 0, currency: 'USD' };
        const travelerIndex = decoded.travelerIndex ?? 0;
        return {
          type: 'baggage' as const,
          travelerIndex,
          travelerRef: `travelerRefId_${travelerIndex + 1}`,
          segmentRef: decoded.segmentRef ?? 'segment_1',
          ancillaryProductId: decoded.productId,
          catalogOfferingIdentifier: decoded.catalogOfferingIdentifier,
          catalogOfferingsIdentifier: decoded.catalogOfferingsIdentifier,
          label: decoded.label,
          baggageType: 'Checked',
          weight: '23kg',
          pieces: 1,
          price: { amount: price.amount, currency: price.currency },
        };
      })
      .filter((b) => b !== null) as AncillaryBaggageInput[];
  }

  /** Convert currently selected service IDs into structured ancillary format */
  function buildStructuredAncillaryServices(): AncillaryServiceInput[] {
    return serviceProductIds
      .map((id) => {
        const decoded = decodeService(id);
        if (!decoded) return null;
        const price = decoded.priceText ? parsePriceText(decoded.priceText) : { amount: 0, currency: 'USD' };
        const travelerIndex = decoded.travelerIndex ?? 0;
        return {
          type: decoded.serviceType as AncillaryServiceInput['type'],
          travelerIndex,
          travelerRef: `travelerRefId_${travelerIndex + 1}`,
          segmentRef: decoded.segmentRef ?? 'segment_1',
          ancillaryProductId: decoded.productId,
          catalogOfferingIdentifier: decoded.catalogOfferingIdentifier,
          catalogOfferingsIdentifier: decoded.catalogOfferingsIdentifier,
          label: decoded.label,
          serviceType: decoded.serviceType,
          quantity: 1,
          price: { amount: price.amount, currency: price.currency },
        };
      })
      .filter((s) => s !== null) as AncillaryServiceInput[];
  }

  /** Convert currently selected meal IDs into structured ancillary format */
  function buildStructuredAncillaryMeals(): AncillaryMealInput[] {
    return mealSelectionIds
      .map((id, index) => {
        if (!id) return null;
        const decoded = decodeMeal(id);
        if (!decoded) return null;
        const price = decoded.priceText ? parsePriceText(decoded.priceText) : { amount: 0, currency: 'USD' };
        return {
          type: 'meal' as const,
          travelerIndex: index,
          travelerRef: `travelerRefId_${index + 1}`,
          segmentRef: 'segment_1',
          ancillaryProductId: decoded.productId,
          mealCode: decoded.mealCode,
          mealName: decoded.mealName,
          dietaryType: decoded.dietaryType,
          price: { amount: price.amount, currency: price.currency },
        };
      })
      .filter((m): m is AncillaryMealInput => m !== null);
  }

  function buildAncillaryPayload(): AncillarySelectionsInput | undefined {
    const seats = buildStructuredAncillarySeats();
    const baggage = buildStructuredAncillaryBaggage();
    const services = buildStructuredAncillaryServices();
    const meals = buildStructuredAncillaryMeals();
    if (seats.length === 0 && baggage.length === 0 && services.length === 0 && meals.length === 0) return undefined;
    return { seats, baggage, meals, services };
  }

  function addSampleData() {
    const samples = [
      { givenName: "Adam", surname: "Walker", gender: "Male" as const, birthDate: "1990-05-15", phoneCountryCode: "92", phoneNumber: "3001234567", email: "adam.walker@example.com" },
      { givenName: "Sara", surname: "Khan", gender: "Female" as const, birthDate: "1992-09-21", phoneCountryCode: "92", phoneNumber: "3007654321", email: "sara.khan@example.com" },
      { givenName: "Omar", surname: "Reed", gender: "Male" as const, birthDate: "1988-02-10", phoneCountryCode: "92", phoneNumber: "3015557788", email: "omar.reed@example.com" },
      { givenName: "Maya", surname: "Stone", gender: "Female" as const, birthDate: "1995-12-04", phoneCountryCode: "92", phoneNumber: "3024448899", email: "maya.stone@example.com" },
    ];
    setTravelers((current) => current.map((_, index) => samples[index % samples.length]));
  }

  function validate(): string | null {
    for (const traveler of travelers) {
      const travelerError = validateTravelerInput({
        givenName: traveler.givenName,
        surname: traveler.surname,
        birthDate: traveler.birthDate,
        email: traveler.email,
        phoneCountryCode: traveler.phoneCountryCode,
        phoneNumber: traveler.phoneNumber,
      });
      if (travelerError) return travelerError;
    }
    return null;
  }

  async function handleTravelerNext() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isAgentMode && props.searchKey && !sessionKey) {
      setIsCreatingSession(true);
      try {
        const existingKey = sessionStorage.getItem(`checkout_session_${props.offerId}`);
        if (existingKey) {
          setSessionKey(existingKey);
          const existingData = sessionStorage.getItem(`checkout_session_data_${props.offerId}`);
          if (existingData) {
            try {
              setSessionData(JSON.parse(existingData) as CheckoutSessionResponse);
            } catch {
              // Stored data corrupted — will fall through to old-endpoint catalog
            }
          }
        } else {
          const res = await createCheckoutSession({
            searchKey: props.searchKey,
            offerId: props.offerId,
            catalogUuid: props.catalogUuid || "",
            productId: props.productId,
            productIds: props.productIds,
            productSelections: props.productSelections,
            from: props.from ?? "",
            to: props.to ?? "",
            departureDate,
            tripType: props.tripType as 'one_way' | 'round_trip',
            returnDate: props.returnDate,
            travelers: travelers.map((t) => ({
              givenName: t.givenName,
              surname: t.surname,
              gender: t.gender,
              birthDate: t.birthDate,
              passengerTypeCode: 'ADT',
              phoneCountryCode: t.phoneCountryCode,
              phoneNumber: t.phoneNumber,
              email: t.email,
            })),
          });
          setSessionKey(res.sessionKey);
          setSessionData(res);
          sessionStorage.setItem(`checkout_session_${props.offerId}`, res.sessionKey);
          sessionStorage.setItem(`checkout_session_data_${props.offerId}`, JSON.stringify(res));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        setError(`Session creation failed: ${msg}`);
        return;
      } finally {
        setIsCreatingSession(false);
      }
    }

    // Duffle offers skip the Seats & Extras step, go directly to Payment
    // For Duffle, Payment is step 2; for Travelport, Seats & Extras is step 2
    setCurrentStep(2);
  }

  async function handleCheckout() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }


    const structuredAncillaries = buildAncillaryPayload();

    const offerSnapshot = {
      offerId: props.offerId,
      productId: props.productId,
      productIds: props.productIds,
      productSelections: props.productSelections,
      catalogUuid: props.catalogUuid,
      from: props.from,
      to: props.to,
      departureDate,
      tripType: props.tripType,
      returnDate: props.returnDate,
      searchKey: props.searchKey,
      seatProductIds,
      baggageProductIds,
      ancillaries: structuredAncillaries,
    };

    // ─── Agent Path — unified pipeline Phase 8 ───
    // ONE shared checkout for all roles. The server resolves the caller's
    // role: agents default to the wallet/credit reserve-commit branch; the
    // card selector sends paymentMethod 'gateway' for the PaymentIntent flow.
    // No client-side price is sent — the server's agent-priced preview is
    // authoritative (kills the PRICE_MISMATCH class at the source).
    if (isAgentMode) {
      setIsAgentSubmitting(true);
      try {
        // Proactively refresh JWT before critical operation to prevent mid-flow expiry
        await refreshAuthToken();
        const res = await checkoutMutation.mutateAsync({
          offerId: props.offerId,
          productId,
          productIds: props.productIds,
          productSelections: props.productSelections,
          seatProductIds,
          baggageProductIds,
          ancillaries: structuredAncillaries,
          catalogUuid,
          tripType: props.tripType,
          returnDate,
          from: props.from ?? "",
          to: props.to ?? "",
          departureDate,
          searchKey: props.searchKey,
          sessionKey: sessionKey ?? undefined,
          currency: selectedCurrency.code,
          travelers: buildTravelerPayload(),
          // ponytail: flight DTO gateway type is card-only — cast, backend manual-hold path is role-agnostic
          gateway: (paymentMethod === 'card' ? toCheckoutGateway(agentGateway) : 'STRIPE') as PaymentGateway,
          ...(paymentMethod === 'card' ? { paymentMethod: 'gateway' as const } : {}),
        });
        if (res.paymentMethod === 'wallet') {
          toast.success('Booking submitted', 'Pending supplier confirmation — wallet is charged on success.');
          router.push(`/booking/${res.bookingId}/success?type=flight&mode=agent`);
        } else if (paymentMethod === 'card' && isManualGatewayKey(agentGateway)) {
          // Manual methods hold the booking — no gateway intent.
          sessionStorage.setItem("checkout_data", JSON.stringify({
            paymentId: res.paymentId,
            bookingId: res.bookingId,
            bookingType: 'flight',
            amount: res.amount,
            currency: res.currency,
            clientSecret: null,
            checkoutUrl: null,
            paymentMethod: agentGateway,
            isAgent: true,
          }));
          toast.success('Booking held', 'Continue to review and confirm your booking.');
          router.push(`/checkout/${res.paymentId}?mode=agent`);
        } else {
          sessionStorage.setItem("checkout_data", JSON.stringify({
            paymentId: res.paymentId,
            bookingId: res.bookingId,
            bookingType: 'flight',
            amount: res.amount,
            currency: res.currency,
            clientSecret: res.clientSecret ?? null,
            checkoutUrl: res.checkoutUrl ?? null,
            paymentMethod: paymentMethod === 'card' ? agentGateway : 'stripe',
            isAgent: true,
          }));
          toast.success('Checkout initiated', 'Redirecting to payment...');
          router.push(`/checkout/${res.paymentId}?mode=agent`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Booking failed.';
        setError(message);
        toast.error('Booking failed', message);
      } finally {
        setIsAgentSubmitting(false);
      }
      return;
    }

    // ─── Customer Path ───
    if (!props.searchKey) {
      setError("Search session expired. Please search again.");
      return;
    }

    if (!sessionKey) {
      setError("Checkout session not ready yet. Please wait for session creation.");
      return;
    }

    try {
      // ponytail: gateway DTO requires a value — 'STRIPE' placeholder, server takes wallet branch
      const res = await checkoutMutation.mutateAsync({
        offerId: props.offerId,
        productId,
        productIds: props.productIds,
        productSelections: props.productSelections,
        seatProductIds,
        baggageProductIds,
        ancillaries: structuredAncillaries,
        catalogUuid,
        tripType: props.tripType,
        returnDate,
        from: props.from ?? "",
        to: props.to ?? "",
        departureDate,
        searchKey: props.searchKey,
        sessionKey,
        totalPrice: totalWithAncillaries > 0 ? convertAmount(totalWithAncillaries, currencyCode) : undefined,
        currency: selectedCurrency.code,
        travelers: buildTravelerPayload(),
        gateway: payWithWallet ? 'STRIPE' : gateway,
        ...(payWithWallet ? { paymentMethod: 'wallet' as const } : {}),
        successUrl: typeof window !== 'undefined' ? `${window.location.origin}/booking/success?type=flight` : undefined,
        cancelUrl: typeof window !== 'undefined' ? `${window.location.origin}/offer/${props.offerId}` : undefined,
      });

      // Wallet bookings settle via reserve-commit — no gateway redirect.
      if (payWithWallet && res.paymentMethod === 'wallet') {
        toast.success('Booking submitted', 'Pending supplier confirmation — wallet is charged on success.');
        router.push(`/booking/${res.bookingId}/success?type=flight&mode=customer`);
        return;
      }

      sessionStorage.setItem("checkout_data", JSON.stringify({
        paymentId: res.paymentId,
        bookingId: res.bookingId,
        bookingType: 'flight',
        amount: res.amount,
        currency: res.currency,
        clientSecret: res.clientSecret ?? null,
        checkoutUrl: res.checkoutUrl ?? null,
        hotelName: null,
        roomName: null,
        paymentMethod: gateway === 'STRIPE' ? 'stripe' : (gateway === 'PAYPAL' ? 'paypal' : undefined),
        priceBreakdown: res.priceBreakdown ?? null,
      }));

      toast.success("Checkout initiated", "Redirecting to payment...");
      router.push(`/checkout/${res.paymentId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Checkout failed.";
      const lower = message.toLowerCase();
      const isFareUnavailable =
        lower.includes("fare is not available") ||
        lower.includes("fare not available") ||
        lower.includes("no longer available") ||
        lower.includes("offer unavailable") ||
        lower.includes("not available");
      if (isFareUnavailable) {
        clearOffer();
        toast.error("Fare No Longer Available", "This flight offer is no longer available at the shown price. Redirecting to search...");
        router.push("/flights/search");
        return;
      }
      setError(message);
      toast.error("Checkout failed", message);
    }
  }

  // All providers use the 3-step flow: Traveler Details → Seats & Extras → Payment
  const steps = [
    { num: 1, label: 'Traveler Details' },
    { num: 2, label: 'Seats & Extras' },
    { num: 3, label: 'Payment' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* ─── Main Column ─── */}
      <div className="space-y-6">
        {/* ─── Step Progress ─── */}
        <div className="flex items-center gap-0">
          {steps.map((step, idx) => {
            const stepNum = step.num;
            const isActive = currentStep === stepNum;
            const isDone = currentStep > stepNum;
            const showConnector = idx < steps.length - 1;
            return (
              <div key={stepNum} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 ${isActive ? 'text-brand-teal' : isDone ? 'text-green-600' : 'text-zinc-400'}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${currentStep >= stepNum ? 'bg-brand-teal text-white' : 'bg-zinc-200 text-zinc-500'}`}>
                    {isDone ? '\u2713' : stepNum}
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
                </div>
                {showConnector && <div className="h-px flex-1 bg-zinc-200 mx-3" />}
              </div>
            );
          })}
        </div>

        {/* ─── Flight Summary Hero ─── */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-brand-teal to-brand-teal-800 px-5 py-6 text-white">
            <div className="flex items-center gap-2 text-xs text-zinc-300 uppercase tracking-wider mb-4">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
              {props.tripType === 'round_trip' ? 'Round trip' : 'One way'} · {formatDate(props.departureAt)}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-center min-w-[72px]">
                <p className="text-2xl font-bold tabular-nums">{formatTime(props.departureAt)}</p>
                <p className="text-xs text-zinc-300 mt-0.5">{props.from || '---'}</p>
              </div>

              <div className="flex-1 flex flex-col items-center px-2">
                <span className="text-[11px] text-zinc-300 mb-1">{duration || '--'}</span>
                <div className="w-full flex items-center">
                  <div className="h-px flex-1 bg-zinc-500" />
                  <svg className="h-3 w-3 text-zinc-300 -ml-0.5" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 0l8 8-8 8-8-8z" />
                  </svg>
                </div>
                <span className="text-[10px] text-zinc-400 mt-1">Direct flight</span>
              </div>

              <div className="text-center min-w-[72px]">
                <p className="text-2xl font-bold tabular-nums">{formatTime(props.arrivalAt)}</p>
                <p className="text-xs text-zinc-300 mt-0.5">{props.to || '---'}</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-zinc-100 px-5 py-3 text-sm">
            <div className="flex items-center justify-between py-2">
              <span className="text-zinc-500">Offer ID</span>
              <span className="font-mono text-xs text-zinc-700">{props.offerId.slice(0, 16)}...</span>
            </div>
            {props.tripType === 'round_trip' && props.returnDate ? (
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500">Return</span>
                <span className="font-medium text-zinc-900">{formatDate(props.returnDate)}</span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ─── Step 1: Traveler Details ─── */}
        {currentStep === 1 && (
          <Card>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Traveler Details</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {travelers.length} traveler{travelers.length === 1 ? '' : 's'} · Fill in details for each passenger
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addSampleData}>
                <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
                Fill sample data
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              {travelers.map((traveler, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-zinc-200 bg-white overflow-hidden transition hover:shadow-sm"
                >
                  <div className="flex items-center justify-between bg-zinc-50 px-4 py-2.5 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <h3 className="text-sm font-semibold text-zinc-900">Traveler {index + 1}</h3>
                    </div>
                    <Badge variant="default" className="text-[11px]">Adult</Badge>
                  </div>
                  <div className="p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="First name *"
                        placeholder="First name"
                        value={traveler.givenName}
                        onChange={(e) => updateTraveler(index, 'givenName', e.target.value)}
                        required
                      />
                      <Input
                        label="Last name *"
                        placeholder="Last name"
                        value={traveler.surname}
                        onChange={(e) => updateTraveler(index, 'surname', e.target.value)}
                        required
                      />
                      <Select
                        label="Gender *"
                        options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }]}
                        value={traveler.gender}
                        onChange={(e) => updateTraveler(index, 'gender', e.target.value as TravelerDraft['gender'])}
                      />
                      <Input
                        label="Date of birth *"
                        type="date"
                        value={traveler.birthDate}
                        onChange={(e) => updateTraveler(index, 'birthDate', e.target.value)}
                        required
                      />
                      <Input
                        label="Phone country code *"
                        placeholder="92"
                        value={traveler.phoneCountryCode}
                        onChange={(e) => updateTraveler(index, 'phoneCountryCode', e.target.value)}
                        required
                      />
                      <Input
                        label="Phone number *"
                        placeholder="3001234567"
                        value={traveler.phoneNumber}
                        onChange={(e) => updateTraveler(index, 'phoneNumber', e.target.value)}
                        required
                      />
                      <Input
                        label="Email *"
                        placeholder="traveler@example.com"
                        type="email"
                        className="sm:col-span-2"
                        value={traveler.email}
                        onChange={(e) => updateTraveler(index, 'email', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Product fields (collapsible debug) */}
            <button
              type="button"
              onClick={() => setShowProductFields(!showProductFields)}
              className="mt-4 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition"
            >
              <svg className={`h-3 w-3 transition ${showProductFields ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              Product configuration
            </button>
            {showProductFields ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Product ID" placeholder="Product ID" value={productId} onChange={(e) => setProductId(e.target.value)} />
                <Input label="Catalog UUID" placeholder="Catalog UUID" value={catalogUuid} onChange={(e) => setCatalogUuid(e.target.value)} />
              </div>
            ) : null}

            <div className="mt-6 flex justify-end border-t border-zinc-100 pt-4">
              <Button onClick={handleTravelerNext} loading={isCreatingSession} size="lg">
                Next: Seats & Extras
              </Button>
            </div>
          </Card>
        )}

        {/* ─── Step 2: Seats & Extras ─── */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <AncillarySelectionPanel
              offerId={props.offerId}
              searchKey={props.searchKey}
              from={props.from}
              to={props.to}
              departureDate={departureDate}
              travelerCount={travelers.length}
              provider={props.provider}
              travelerNames={travelerNames}
              seatProductIds={seatProductIds}
              baggageProductIds={baggageProductIds}
              serviceProductIds={serviceProductIds}
              mealSelectionIds={mealSelectionIds}
              onSeatProductIdsChange={setSeatProductIds}
              onBaggageProductIdsChange={setBaggageProductIds}
              onServiceProductIdsChange={setServiceProductIds}
              onMealSelectionIdsChange={setMealSelectionIds}
              sessionCatalog={sessionData?.ancillaryCatalog ?? undefined}
            />
            <div className="flex gap-3 justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep(1)} size="lg">
                Back: Traveler Details
              </Button>
              <Button onClick={() => setCurrentStep(3)} size="lg">
                Next: Payment
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Payment & Checkout ─── */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* ─── Payment Method ─── */}
            {isAgentMode && effectiveAgentMarkups ? (
              <Card>
                <h2 className="text-base font-semibold text-zinc-900 mb-1">Payment Method</h2>
                <p className="text-xs text-zinc-500 mb-4">Choose how to pay for this booking</p>
                {agentWallet ? (
                  <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">Wallet balance ({agentWalletCurrency})</span>
                      <span className="font-semibold text-zinc-900">{formatPrice(agentWallet.walletBalance, agentWalletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">Credit available ({agentWalletCurrency})</span>
                      <span className={`font-semibold ${agentWallet.creditAvailable > 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>{formatPrice(agentWallet.creditAvailable, agentWalletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                      <span className="font-medium text-zinc-600">Total available ({agentWalletCurrency})</span>
                      <span className={`font-bold ${agentWalletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(agentWalletTotal, agentWalletCurrency)}</span>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wallet')}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                      paymentMethod === 'wallet'
                        ? 'border-brand-teal bg-brand-teal/5 ring-1 ring-brand-teal/20'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      paymentMethod === 'wallet' ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Wallet</p>
                      <p className="text-xs text-zinc-500">Pay from agent balance</p>
                    </div>
                    {paymentMethod === 'wallet' ? (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                      paymentMethod === 'card'
                        ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      paymentMethod === 'card' ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Card</p>
                      <p className="text-xs text-zinc-500">Pay with Stripe or PayPal</p>
                    </div>
                    {paymentMethod === 'card' ? (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                </div>
                {paymentMethod === 'wallet' && agentWallet && !agentWalletSufficient ? (
                  <p className="mt-2 text-xs font-medium text-red-600">Insufficient wallet + credit for this booking — top up or pay by card.</p>
                ) : null}

                {paymentMethod === 'card' && gatewaysLoaded && availableGateways.length > 0 ? (
                  <div className="mt-4 border-t border-zinc-100 pt-4">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Card Provider</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {availableGateways.map((gw) => {
                        const isSelected = agentGateway === gw.gateway;
                        return (
                          <button
                            key={gw.gateway}
                            type="button"
                            onClick={() => setAgentGateway(gw.gateway)}
                            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                              isSelected
                                ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10'
                                : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                            }`}
                          >
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              isSelected ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                            }`}>
                              {gw.gateway === 'stripe' ? (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.859 6.09 1.631l.889-4.033C17.08 2.326 14.815 1.5 12.6 1.5c-4.683 0-7.59 2.651-7.59 6.3 0 3.956 4.046 5.466 6.663 6.215 2.145.615 3.288 1.326 3.288 2.328 0 1.023-.794 1.548-2.25 1.548-2.673 0-5.258-1.136-7.02-2.307l-.919 4.183c1.857 1.046 4.247 1.903 7.069 1.903 4.978 0 8.006-2.595 8.006-6.577.001-4.032-3.463-5.733-6.763-6.794z"/>
                                </svg>
                              ) : gw.gateway === 'paypal' ? (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
                                </svg>
                              ) : gw.gateway === 'bank_transfer' ? (
                                <BankTransferIcon />
                              ) : (
                                <PayLaterIcon />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-zinc-900">{gatewayLabel(gw.gateway).title}</p>
                              <p className="text-xs text-zinc-500">{gatewayLabel(gw.gateway).subtitle}</p>
                            </div>
                            {isSelected ? (
                              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : paymentMethod === 'card' && gatewaysLoaded && availableGateways.length === 0 ? (
                  <div className="mt-4 border-t border-zinc-100 pt-4">
                    <div className="flex items-center gap-2 text-sm text-amber-700">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <span>No payment gateways are enabled. Please contact support.</span>
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : isAgentMode ? (
              <Card className="border-amber-200 bg-amber-50">
                <div className="flex items-center gap-3 p-4 text-amber-800">
                  <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div>
                    <p className="font-medium">Session expired</p>
                    <p className="text-xs text-amber-700">Price data not found. Please search again and re-select the offer.</p>
                  </div>
                </div>
              </Card>
            ) : gatewaysLoaded && availableGateways.length > 0 ? (
              <Card>
                <h2 className="text-base font-semibold text-zinc-900 mb-1">Payment Method</h2>
                <p className="text-xs text-zinc-500 mb-4">Choose how you want to pay</p>
                {showCustomerWallet && customerWallet ? (
                  <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">Wallet balance ({customerWalletCurrency})</span>
                      <span className="font-semibold text-zinc-900">{formatPrice(customerWallet.walletBalance, customerWalletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                      <span className="font-medium text-zinc-600">Total available ({customerWalletCurrency})</span>
                      <span className={`font-bold ${customerWalletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(customerWalletTotal, customerWalletCurrency)}</span>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {showCustomerWallet ? (
                    <button
                      type="button"
                      onClick={() => setPayWithWallet(true)}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                        payWithWallet
                          ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                      }`}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        payWithWallet ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900">Wallet</p>
                        <p className="text-xs text-zinc-500">Balance {formatPrice(customerWalletTotal, customerWallet?.currency ?? currencyCode)}</p>
                      </div>
                      {payWithWallet ? (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {availableGateways.map((gw) => {
                    const gwUpper = gw.gateway.toUpperCase() as PaymentGateway;
                    const isSelected = !payWithWallet && gateway === gwUpper;
                    return (
                      <button
                        key={gw.gateway}
                        type="button"
                        onClick={() => { setPayWithWallet(false); setGateway(gwUpper); }}
                        className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                          isSelected
                            ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                        }`}
                      >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          isSelected ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                        }`}>
                          {gw.gateway === 'stripe' ? (
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.859 6.09 1.631l.889-4.033C17.08 2.326 14.815 1.5 12.6 1.5c-4.683 0-7.59 2.651-7.59 6.3 0 3.956 4.046 5.466 6.663 6.215 2.145.615 3.288 1.326 3.288 2.328 0 1.023-.794 1.548-2.25 1.548-2.673 0-5.258-1.136-7.02-2.307l-.919 4.183c1.857 1.046 4.247 1.903 7.069 1.903 4.978 0 8.006-2.595 8.006-6.577.001-4.032-3.463-5.733-6.763-6.794z"/>
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-900">{gw.gateway === 'stripe' ? 'Stripe' : 'PayPal'}</p>
                          <p className="text-xs text-zinc-500">{gw.gateway === 'stripe' ? 'Credit or debit card' : 'PayPal account'}</p>
                        </div>
                        {isSelected ? (
                          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                      );
                    })}
                </div>
                {payWithWallet && showCustomerWallet && !customerWalletSufficient ? (
                  <p className="mt-2 text-xs font-medium text-red-600">Insufficient wallet balance for this booking — top up your wallet or choose another method.</p>
                ) : null}
              </Card>
            ) : gatewaysLoaded && availableGateways.length === 0 ? (
              <Card>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span>No payment gateways are enabled. Please contact support.</span>
                </div>
              </Card>
            ) : null}

            <div className="flex gap-3 justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep(2)} size="lg">
                Back: Seats & Extras
              </Button>
              <Button
                onClick={handleCheckout}
                loading={checkoutMutation.isPending || isCreatingSession || isAgentSubmitting}
                disabled={(payWithWallet && !!customerWallet && !customerWalletSufficient) || (isAgentMode && paymentMethod === 'wallet' && !!agentWallet && !agentWalletSufficient)}
                size="lg"
              >
                {isAgentMode ? (
                  paymentMethod === 'wallet'
                    ? `Pay ${formatPrice(totalWithAncillaries, currencyCode)} from Wallet`
                    : `Pay ${formatPrice(totalWithAncillaries, currencyCode)} with ${gatewayLabel(agentGateway).title}`
                ) : isCreatingSession ? (
                  'Creating session...'
                ) : checkoutMutation.isPending ? (
                  'Processing...'
                ) : payWithWallet ? (
                  `Pay ${formatPrice(totalWithAncillaries, currencyCode)} with Wallet`
                ) : (
                  `Pay ${formatPrice(totalWithAncillaries, currencyCode)} with ${gateway === 'STRIPE' ? 'Card' : 'PayPal'}`
                )}
              </Button>
            </div>
          </div>
        )}

        {error ? <ErrorBox message={error} onRetry={() => setError(null)} /> : null}
      </div>

      {/* ─── Sidebar Summary ─── */}
      <div className="space-y-4">
        <div className="lg:sticky lg:top-6 space-y-4">
          {/* Price Summary */}
          <Card className="bg-zinc-50">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">
              {isAgentMode ? 'Agent Pricing' : 'Price Summary'}
            </h3>
            <div className="space-y-2 text-sm">
              {isAgentMode && effectiveAgentMarkups ? (
                <>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Net Price</span>
                    <span>{formatPrice(effectiveAgentMarkups.originalPrice, currencyCode)}</span>
                  </div>
                  {effectiveAgentMarkups.appliedRules.map((rule, i) => (
                    <div key={i} className="flex items-center justify-between text-zinc-600">
                      <span className="flex items-center gap-1">
                        {rule.name}
                        {effectiveAgentMarkups.markupPercent > 0 ? (
                          <span className="text-[10px] text-brand-teal">+{effectiveAgentMarkups.markupPercent}%</span>
                        ) : null}
                      </span>
                      <span className="text-brand-teal">+{formatPrice(rule.markupAmount, currencyCode)}</span>
                    </div>
                  ))}
                  <div className="border-t border-zinc-200 pt-2 flex items-center justify-between font-semibold text-brand-teal">
                    <span>Total (marked up)</span>
                    <span className="tabular-nums">{formatPrice(effectiveAgentMarkups.markedUpPrice, currencyCode)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span className="flex items-center gap-1">
                      Fare
                      <span className="text-[10px] text-zinc-400 font-normal">(incl. taxes &amp; fees)</span>
                    </span>
                    <span>{formatPrice(baseFare, currencyCode)}</span>
                  </div>
                  <PriceBreakdownNote
                    supplierAmount={checkoutMutation.data?.priceBreakdown?.supplierBase}
                    markupAmount={checkoutMutation.data?.priceBreakdown?.markupAmount}
                    currency={currencyCode}
                    label="Markup (admin)"
                  />

                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Seats</span>
                    <span>
                      {seatProductIds.length > 0 ? (
                        <span className="tabular-nums">{formatPrice(seatPrice, props.currency ?? 'USD')}</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Not selected</span>
                      )}
                    </span>
                  </div>
                  {seatProductIds.length > 0 ? (
                    <div className="pl-4 space-y-1">
                      {seatProductIds.map((id, i) => {
                        const s = decodeSeat(id);
                        if (!s) return null;
                        const paxIdx = s.passengerIndex ?? 0;
                        const paxName = travelerNames?.[paxIdx] ?? `Traveler ${paxIdx + 1}`;
                        return (
                          <div key={i} className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>{s.flightLabel} · {s.seat}{travelerNames && travelerNames.length > 1 ? ` · ${paxName}` : ''}</span>
                            <span>{s.priceText}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Baggage</span>
                    <span>
                      {baggageProductIds.length > 0 ? (
                        <span className="tabular-nums">{formatPrice(baggagePrice, props.currency ?? 'USD')}</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Not selected</span>
                      )}
                    </span>
                  </div>
                  {baggageProductIds.length > 0 ? (
                    <div className="pl-4 space-y-1">
                      {baggageProductIds.map((id, i) => {
                        const b = decodeBaggage(id);
                        return b ? (
                          <div key={i} className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>{b.label}</span>
                            <span>{b.priceText}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Services</span>
                    <span>
                      {serviceProductIds.length > 0 ? (
                        <span className="tabular-nums">{formatPrice(servicePrice, props.currency ?? 'USD')}</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Not selected</span>
                      )}
                    </span>
                  </div>
                  {serviceProductIds.length > 0 ? (
                    <div className="pl-4 space-y-1">
                      {serviceProductIds.map((id, i) => {
                        const s = decodeService(id);
                        return s ? (
                          <div key={i} className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>{s.label}</span>
                            <span>{s.priceText || 'Free'}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Meals</span>
                    <span>
                      {mealSelectionIds.some(Boolean) ? (
                        <span className="tabular-nums">{formatPrice(mealPrice, props.currency ?? 'USD')}</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Not selected</span>
                      )}
                    </span>
                  </div>
                  {mealSelectionIds.some(Boolean) ? (
                    <div className="pl-4 space-y-1">
                      {mealSelectionIds.map((id, i) => {
                        if (!id) return null;
                        const m = decodeMeal(id);
                        return m ? (
                          <div key={i} className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>{m.mealName}</span>
                            <span>{m.priceText || 'Free'}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  ) : null}

                  <div className="border-t border-zinc-200 pt-2 flex items-center justify-between font-semibold text-zinc-900">
                    <span>Total</span>
                    <span className="tabular-nums">{formatPrice(totalWithAncillaries, currencyCode)}</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
