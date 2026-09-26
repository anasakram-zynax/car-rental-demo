"use client";
import { useTranslations } from 'next-intl';


import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHotelCheckout } from "@/features/hotels/hooks";
import { checkRateApi } from "@/features/hotels/api/check-rate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { BankTransferDetails } from "@/components/booking/bank-transfer-details";
import { BankTransferIcon, PayLaterIcon } from "@/components/booking/payment-method-icons";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/context/CurrencyContext";
import { ErrorBox } from "@/components/ui/state/error-box";
import { getEnabledGateways, gatewayLabel, toCheckoutGateway, isManualGatewayKey } from "@/features/payments/api/get-gateway-config";
import { getCustomerWalletBalance } from "@/features/wallet/api/customer-wallet";
import type { CustomerWalletBalance } from "@/features/wallet/api/customer-wallet";
import { getWalletBalance } from "@/features/wallet/api/agent-wallet";
import type { WalletBalance } from "@/features/wallet/api/agent-wallet";
import type { GatewayListItem } from "@/features/payments/api/get-gateway-config";
import { getAgentAccess, isAllowed } from "@/features/agent/api/agent-access";

interface Props {
  offerId: string;
  hotelName?: string;
  destination?: string;
  /** @deprecated Use rateId */
  rateKey?: string;
  /** Provider-neutral rate identifier (preferred over rateKey) */
  rateId?: string;
  roomName?: string;
  boardName?: string;
  price?: string;
  checkIn?: string;
  checkOut?: string;
  roomAdults: string;
  roomChildren: string;
  /** @default 'customer' */
  mode?: 'customer' | 'agent';
  /** Provider key (e.g. hotelbeds, ratehawk) */
  provider?: string;
}

interface GuestDraft {
  roomId: string;
  name: string;
  lastName: string;
  age: string;
}

type RoomDef = {
  roomId: string;
  adults: number;
  children: number;
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseRooms(roomAdults: string, roomChildren: string): RoomDef[] {
  const adultsList = roomAdults.split(',').map(Number);
  const childrenList = roomChildren.split(',').map(Number);
  return adultsList.map((adults, i) => ({
    roomId: String(i + 1),
    adults,
    children: childrenList[i] ?? 0,
  }));
}

function buildGuestList(rooms: RoomDef[]): GuestDraft[] {
  const guests: GuestDraft[] = [];
  for (const room of rooms) {
    for (let i = 0; i < room.adults + room.children; i++) {
      guests.push({ roomId: room.roomId, name: "", lastName: "", age: "" });
    }
  }
  return guests;
}

export function HotelOfferForm(props: Props) {
  const t = useTranslations('Hotels');
  const { isAgent: isSignedInAgent, isAuthenticated, isAdmin } = useAuth();
  const isCustomer = isAuthenticated && !isSignedInAgent && !isAdmin;
  const isAgentMode = props.mode === 'agent' || isSignedInAgent;
  const rooms = useMemo(() => parseRooms(props.roomAdults, props.roomChildren), [props.roomAdults, props.roomChildren]);
  const [holderName, setHolderName] = useState("");
  const [holderLastName, setHolderLastName] = useState("");
  const [guests, setGuests] = useState<GuestDraft[]>(() => buildGuestList(rooms));
  const [paymentMethod, setPaymentMethod] = useState<string>('stripe');
  const [error, setError] = useState<string | null>(null);
  const [verifiedPrice, setVerifiedPrice] = useState<{ net: number; currency: string } | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [priceWarning, setPriceWarning] = useState<string | null>(null);
  const [availableGateways, setAvailableGateways] = useState<GatewayListItem[]>([]);
  const [gatewaysLoaded, setGatewaysLoaded] = useState(false);
  const [agentPaymentMethod, setAgentPaymentMethod] = useState<'wallet' | 'card'>('wallet');
  const [customerWallet, setCustomerWallet] = useState<CustomerWalletBalance | null>(null);
  const [agentWallet, setAgentWallet] = useState<WalletBalance | null>(null);
  const [agentCardGateway, setAgentCardGateway] = useState<'stripe' | 'paypal' | 'bank_transfer' | 'pay_later'>('stripe');
  const [isAgentSubmitting, setIsAgentSubmitting] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const checkoutMutation = useHotelCheckout();
  const { formatPrice, convertAmount, selectedCurrency } = useCurrency();

  const parsedPrice = props.price ? Number(props.price) : null;
  const totalGuests = rooms.reduce((sum, r) => sum + r.adults + r.children, 0);
  const nights = props.checkIn && props.checkOut
    ? Math.max(1, Math.round((new Date(props.checkOut).getTime() - new Date(props.checkIn).getTime()) / 86400000))
    : 1;

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
        setAgentCardGateway((prev) => (keys.includes(prev) ? prev : keys[0]));
      } else {
        const first = enabled[0].gateway;
        if (first !== paymentMethod) {
          setPaymentMethod(first);
        }
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

  // Use rateId (preferred) or rateKey (legacy) for price verification
  const effectiveRateId = props.rateId || props.rateKey;

  useEffect(() => {
    if (!effectiveRateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerifying(false);
      return;
    }
    let cancelled = false;
    setVerifying(true);
    checkRateApi({ rateKey: effectiveRateId, rateId: effectiveRateId })
      .then((res) => {
        if (cancelled) return;
        const totalNet = (res.rooms ?? []).reduce(
          (sum, room) => sum + (room.rates ?? []).reduce((rSum, r) => rSum + Number(r.net ?? 0), 0),
          0,
        );
        setVerifiedPrice({ net: totalNet, currency: res.currency ?? 'EUR' });
        setVerifying(false);

        const searchPrice = props.price ? Number(props.price) : null;
        if (searchPrice !== null && Math.abs(totalNet - searchPrice) > 0.01) {
          const diff = ((totalNet - searchPrice) / searchPrice) * 100;
          setPriceWarning(
            t("priceChangedWarning", {
              direction: diff > 0 ? t("increasedWord") : t("decreasedWord"),
              percent: Math.abs(diff).toFixed(2),
              current: formatPrice(totalNet, res.currency ?? 'EUR'),
              search: formatPrice(searchPrice!, res.currency ?? 'EUR'),
            }),
          );
        } else {
          setPriceWarning(null);
        }
      })
      .catch(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => { cancelled = true; };
  }, [effectiveRateId, props.price]);

  function updateGuest(index: number, key: keyof GuestDraft, value: string) {
    setGuests((current) => current.map((g, i) => (i === index ? { ...g, [key]: value } : g)));
  }

  const isDev = process.env.NODE_ENV !== 'production';

  function fillSampleData() {
    const samples = [
      { name: "Adam", lastName: "Walker", age: "34" },
      { name: "Sara", lastName: "Khan", age: "31" },
      { name: "Omar", lastName: "Reed", age: "36" },
      { name: "Maya", lastName: "Stone", age: "28" },
      { name: "Leo", lastName: "Patel", age: "12" },
      { name: "Emma", lastName: "Clark", age: "7" },
    ];
    setHolderName(samples[0].name);
    setHolderLastName(samples[0].lastName);
    setGuests((current) =>
      current.map((g, i) => {
        const s = samples[(i + 1) % samples.length];
        return { ...g, name: s.name, lastName: s.lastName, age: s.age };
      }),
    );
  }

  function validate(): string | null {
    if (!holderName.trim() || !holderLastName.trim()) {
      return t("holderRequired");
    }
    if (guests.length === 0) {
      return t("guestRequired");
    }
    for (let i = 0; i < guests.length; i++) {
      if (!guests[i].name.trim() || !guests[i].lastName.trim()) {
        return t("guestNameRequired", { index: i + 1 });
      }
    }
    return null;
  }

  function buildPaxes() {
    return guests.map((g) => ({
      roomId: g.roomId,
      type: g.age.trim() && Number(g.age) < 18 ? "CHILD" : "ADULT",
      name: g.name.trim(),
      surname: g.lastName.trim(),
    }));
  }

  function buildHolder() {
    return { name: holderName.trim(), surname: holderLastName.trim() };
  }

  async function handleCheckout() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    // ─── Agent Path — unified pipeline Phase 9 ───
    // ONE shared checkout for all roles. The server resolves the caller's
    // role: agents default to the wallet/credit reserve-commit branch; the
    // card selector sends paymentMethod 'gateway'. No client-side price is
    // sent — the server's role-aware preview is authoritative.
    if (isAgentMode) {
      setIsAgentSubmitting(true);
      try {
        const res = await checkoutMutation.mutateAsync({
          rateKey: effectiveRateId ?? "",
          rateId: effectiveRateId || undefined,
          provider: props.provider || undefined,
          holder: buildHolder(),
          clientReference: `HB-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          paxes: buildPaxes(),
          gateway: agentPaymentMethod === 'card' ? toCheckoutGateway(agentCardGateway) : 'STRIPE',
          currency: selectedCurrency.code,
          ...(agentPaymentMethod === 'card' ? { paymentMethod: 'gateway' as const } : {}),
        });
        if (res.paymentMethod === 'wallet') {
          toast.success(t('bookingSubmittedTitle'), t('bookingSubmittedWalletDesc'));
          router.push(`/booking/${res.bookingId}/success?type=hotel&mode=agent`);
        } else if (agentPaymentMethod === 'card' && isManualGatewayKey(agentCardGateway)) {
          // Manual methods hold the booking — no gateway intent.
          sessionStorage.setItem('checkout_data', JSON.stringify({
            paymentId: res.paymentId,
            bookingId: res.bookingId,
            bookingType: 'hotel',
            amount: res.amount,
            currency: res.currency,
            clientSecret: null,
            checkoutUrl: null,
            hotelName: props.hotelName ?? null,
            roomName: props.roomName ?? null,
            paymentMethod: agentCardGateway,
            isAgent: true,
          }));
          toast.success(t('bookingHeldTitle'), t('bookingHeldDesc'));
          router.push(`/checkout/${res.paymentId}?mode=agent`);
        } else {
          sessionStorage.setItem('checkout_data', JSON.stringify({
            paymentId: res.paymentId,
            bookingId: res.bookingId,
            bookingType: 'hotel',
            amount: res.amount,
            currency: res.currency,
            clientSecret: res.clientSecret ?? null,
            checkoutUrl: res.checkoutUrl ?? null,
            hotelName: props.hotelName ?? null,
            roomName: props.roomName ?? null,
            paymentMethod: agentCardGateway,
            isAgent: true,
          }));
          toast.success(t('checkoutInitiatedTitle'), t('checkoutRedirectDesc'));
          router.push(`/checkout/${res.paymentId}?mode=agent`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('bookingFailedDefault');
        setError(message);
        toast.error(t('bookingFailedTitle'), message);
      } finally {
        setIsAgentSubmitting(false);
      }
      return;
    }

    // ─── Customer Path ───
    try {
      // ponytail: gateway DTO requires a value — 'STRIPE' placeholder, server takes wallet branch
      const payWithWallet = isCustomer && paymentMethod === 'wallet';
      const res = await checkoutMutation.mutateAsync({
        rateKey: effectiveRateId ?? "",
        rateId: effectiveRateId || undefined,
        provider: props.provider || undefined,
        holder: buildHolder(),
        clientReference: `HB-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        paxes: buildPaxes(),
        gateway: payWithWallet ? 'STRIPE' : toCheckoutGateway(paymentMethod),
        currency: selectedCurrency.code,
        ...(payWithWallet ? { paymentMethod: 'wallet' as const } : {}),
      });

      // Wallet bookings settle via reserve-commit — no gateway redirect.
      if (payWithWallet && res.paymentMethod === 'wallet') {
        toast.success(t('bookingSubmittedTitle'), t('bookingSubmittedWalletDesc'));
        router.push(`/booking/${res.bookingId}/success?type=hotel&mode=customer`);
        return;
      }

      // Manual methods hold the booking — bank details + receipt + confirm
      // continue on the checkout page.
      if (isManualGatewayKey(paymentMethod)) {
        sessionStorage.setItem("checkout_data", JSON.stringify({
          paymentId: res.paymentId,
          bookingId: res.bookingId,
          bookingType: 'hotel',
          amount: res.amount,
          currency: res.currency,
          clientSecret: null,
          checkoutUrl: null,
          hotelName: props.hotelName ?? null,
          roomName: props.roomName ?? null,
          paymentMethod,
        }));
        toast.success(t('bookingHeldTitle'), t('bookingHeldDesc'));
        router.push(`/checkout/${res.paymentId}`);
        return;
      }

      sessionStorage.setItem("checkout_data", JSON.stringify({
        paymentId: res.paymentId,
        bookingId: res.bookingId,
        bookingType: 'hotel',
        amount: res.amount,
        currency: res.currency,
        clientSecret: res.clientSecret ?? null,
        checkoutUrl: res.checkoutUrl ?? null,
        hotelName: props.hotelName ?? null,
        roomName: props.roomName ?? null,
        paymentMethod,
      }));
      toast.success(t('checkoutInitiatedTitle'), t('checkoutRedirectDesc'));
      router.push(`/checkout/${res.paymentId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('checkoutFailedDefault');
      setError(message);
      toast.error(t('checkoutFailedTitle'), message);
    }
  }

  const currentPrice = verifiedPrice?.net ?? parsedPrice ?? 0;
  const currentCurrency = verifiedPrice?.currency ?? 'EUR';
  const customerWalletCurrency = customerWallet?.currency ?? selectedCurrency.code;
  const customerWalletTotal = customerWallet ? customerWallet.walletBalance + (customerWallet.creditAvailable ?? 0) : 0;
  const customerWalletTotalInSelected = customerWalletCurrency === selectedCurrency.code ? customerWalletTotal : convertAmount(customerWalletTotal, customerWalletCurrency);
  const currentPriceInSelected = currentCurrency === selectedCurrency.code ? currentPrice : convertAmount(currentPrice, currentCurrency);
  const customerWalletSufficient = customerWallet ? customerWalletTotalInSelected >= currentPriceInSelected : false;
  const showCustomerWallet = isCustomer && !!customerWallet && customerWallet.walletBalance > 0;
  // Agent wallet vs hotel charge — convert-then-compare in selected currency.
  const agentWalletCurrency = agentWallet?.currency ?? selectedCurrency.code;
  const agentWalletTotal = agentWallet ? agentWallet.walletBalance + agentWallet.creditAvailable : 0;
  const agentWalletTotalInSelected = agentWalletCurrency === selectedCurrency.code ? agentWalletTotal : convertAmount(agentWalletTotal, agentWalletCurrency);
  const agentWalletSufficient = agentWallet ? agentWalletTotalInSelected >= currentPriceInSelected : false;

  const roomSections = useMemo(() => {
    return rooms.map((room, idx) => ({
      ...room,
      guestStart: rooms.slice(0, idx).reduce((sum, r) => sum + r.adults + r.children, 0),
    }));
  }, [rooms]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* ─── Main Column ─── */}
      <div className="space-y-6">
        {/* ─── Hotel Summary Hero ─── */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-brand-teal to-brand-teal-800 px-5 py-6 text-white">
            <div className="flex items-center gap-2 text-xs text-zinc-300 uppercase tracking-wider mb-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              {t('hotelBooking')}
            </div>
            <h1 className="text-xl font-bold mt-2">{props.hotelName || t('hotel')}</h1>
            {props.destination ? (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-zinc-300">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span>{props.destination}</span>
              </div>
            ) : null}
          </div>

          <div className="divide-y divide-zinc-100 px-5 py-3 text-sm">
            {props.checkIn && props.checkOut ? (
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500">{t('checkInOut')}</span>
                <span className="font-medium text-zinc-900">
                  {formatDate(props.checkIn)} → {formatDate(props.checkOut)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between py-2">
              <span className="text-zinc-500">{t('duration')}</span>
              <span className="font-medium text-zinc-900">
                {t('nightsCount', { count: nights })}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-zinc-500">{t('guests')}</span>
              <span className="font-medium text-zinc-900">
                {t('guestsRoomsCount', { guests: totalGuests, rooms: rooms.length })}
              </span>
            </div>
            {props.roomName ? (
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500">{t('roomType')}</span>
                <Badge variant="default">{props.roomName}</Badge>
              </div>
            ) : null}
            {props.boardName ? (
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500">{t('board')}</span>
                <Badge variant="info">{props.boardName}</Badge>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ─── Price Verification Banner (customer only) ─── */}
        {!isAgentMode && verifying ? (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
            <svg className="h-4 w-4 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-zinc-600">{t('verifyingPrice')}</span>
          </div>
        ) : !isAgentMode && priceWarning ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <svg className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="font-medium text-amber-800">{t('priceChanged')}</p>
              <p className="text-amber-700 mt-0.5">{priceWarning}</p>
            </div>
          </div>
        ) : !isAgentMode && verifiedPrice ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-emerald-800">{t('priceConfirmed', { price: formatPrice(currentPrice, currentCurrency) })}</span>
          </div>
        ) : null}

        {/* ─── Holder Details ─── */}
        <Card>
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <h2 className="text-base font-semibold text-zinc-900">{t('contactDetails')}</h2>
            </div>
            {isDev ? (
              <Button type="button" variant="secondary" size="sm" onClick={fillSampleData}>
                <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
                {t('fillSampleData')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500 mb-4 ml-6">{t('mainContactDesc')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={`${t('firstNameLabel')} *`}
              placeholder={t('holderFirstName')}
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              required
            />
            <Input
              label={`${t('lastNameLabel')} *`}
              placeholder={t('holderLastName')}
              value={holderLastName}
              onChange={(e) => setHolderLastName(e.target.value)}
              required
            />
          </div>
        </Card>

        {/* ─── Guest Details per Room ─── */}
        {roomSections.map((room) => (
          <Card key={room.roomId}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-white">
                  {room.roomId}
                </span>
                <h2 className="text-base font-semibold text-zinc-900">{t('roomNumber', { n: room.roomId })}</h2>
              </div>
              <span className="text-xs text-zinc-500">
                {t('roomOccupancy', { adults: room.adults, children: room.children })}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {guests.slice(room.guestStart, room.guestStart + room.adults + room.children).map((guest, idx) => {
                const globalIdx = room.guestStart + idx;
                const isChild = guest.age.trim() && Number(guest.age) < 18;
                return (
                  <div
                    key={globalIdx}
                    className="rounded-xl border border-zinc-200 bg-white overflow-hidden transition hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between bg-zinc-50 px-4 py-2.5 border-b border-zinc-100">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                          {idx + 1}
                        </span>
                        <h3 className="text-sm font-semibold text-zinc-900">
                          {t('guestNumber', { n: idx + 1 })}
                        </h3>
                      </div>
                      <Badge variant={isChild ? 'warning' : 'default'}>
                        {isChild ? t('child') : t('adult')}
                      </Badge>
                    </div>
                    <div className="p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Input
                          label={`${t('firstNameLabel')} *`}
                          placeholder={t('firstNameLabel')}
                          value={guest.name}
                          onChange={(e) => updateGuest(globalIdx, "name", e.target.value)}
                          required
                        />
                        <Input
                          label={`${t('lastNameLabel')} *`}
                          placeholder={t('lastNameLabel')}
                          value={guest.lastName}
                          onChange={(e) => updateGuest(globalIdx, "lastName", e.target.value)}
                          required
                        />
                        <Input
                          label={t('age')}
                          placeholder={t('agePlaceholder')}
                          type="number"
                          value={guest.age}
                          onChange={(e) => updateGuest(globalIdx, "age", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        {/* ─── Payment Method ─── */}
        {isAgentMode ? (
          <Card>
            <h2 className="text-base font-semibold text-zinc-900 mb-1">{t('paymentMethodTitle')}</h2>
            <p className="text-xs text-zinc-500 mb-4">{t('paymentChooseAgent')}</p>
            {agentWallet ? (
              <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-zinc-500">{t('walletBalanceLabel', { currency: agentWalletCurrency })}</span>
                  <span className="font-semibold text-zinc-900">{formatPrice(agentWallet.walletBalance, agentWalletCurrency)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-zinc-500">{t('creditAvailableLabel', { currency: agentWalletCurrency })}</span>
                  <span className={`font-semibold ${agentWallet.creditAvailable > 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>{formatPrice(agentWallet.creditAvailable, agentWalletCurrency)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                  <span className="font-medium text-zinc-600">{t('totalAvailableLabel', { currency: agentWalletCurrency })}</span>
                  <span className={`font-bold ${agentWalletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(agentWalletTotal, agentWalletCurrency)}</span>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Wallet option */}
              <button
                type="button"
                onClick={() => setAgentPaymentMethod('wallet')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                  agentPaymentMethod === 'wallet'
                    ? 'border-brand-teal bg-brand-teal/5 ring-1 ring-brand-teal/20'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  agentPaymentMethod === 'wallet' ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                }`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{t('walletOption')}</p>
                  <p className="text-xs text-zinc-500">{t('walletDescAgent')}</p>
                </div>
                {agentPaymentMethod === 'wallet' ? (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                ) : null}
              </button>

              {/* Card option */}
              <button
                type="button"
                onClick={() => setAgentPaymentMethod('card')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                  agentPaymentMethod === 'card'
                    ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  agentPaymentMethod === 'card' ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-600'
                }`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{t('cardOption')}</p>
                  <p className="text-xs text-zinc-500">{t('cardDescAgent')}</p>
                </div>
                {agentPaymentMethod === 'card' ? (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                ) : null}
              </button>
            </div>

            {agentPaymentMethod === 'wallet' && agentWallet && !agentWalletSufficient ? (
              <p className="mt-2 text-xs font-medium text-red-600">{t('insufficientWalletAgent')}</p>
            ) : null}

            {/* Card sub-selector: Stripe/PayPal */}
            {agentPaymentMethod === 'card' && gatewaysLoaded && availableGateways.length > 0 ? (
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">{t('cardProviderLabel')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableGateways.map((gw) => {
                    const isSelected = agentCardGateway === gw.gateway;
                    return (
                      <button
                        key={gw.gateway}
                        type="button"
                        onClick={() => setAgentCardGateway(gw.gateway)}
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
            ) : agentPaymentMethod === 'card' && gatewaysLoaded && availableGateways.length === 0 ? (
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span>{t('noGateways')}</span>
                </div>
              </div>
            ) : null}
          </Card>
        ) : isAgentMode ? null : gatewaysLoaded && availableGateways.length > 0 ? (
          <Card>
            <h2 className="text-base font-semibold text-zinc-900 mb-1">{t('paymentMethodTitle')}</h2>
            <p className="text-xs text-zinc-500 mb-4">{t('paymentChooseCustomer')}</p>
            {showCustomerWallet && customerWallet ? (
              <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-zinc-500">{t('walletBalanceLabel', { currency: customerWalletCurrency })}</span>
                  <span className="font-semibold text-zinc-900">{formatPrice(customerWallet.walletBalance, customerWalletCurrency)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                  <span className="font-medium text-zinc-600">{t('totalAvailableLabel', { currency: customerWalletCurrency })}</span>
                  <span className={`font-bold ${customerWalletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(customerWalletTotal, customerWalletCurrency)}</span>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {showCustomerWallet ? (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                    paymentMethod === 'wallet'
                      ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10'
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
                    <p className="text-sm font-medium text-zinc-900">{t('walletOption')}</p>
                    <p className="text-xs text-zinc-500">{t('walletBalanceShort', { balance: formatPrice(customerWalletTotal, customerWallet?.currency ?? currentCurrency) })}</p>
                  </div>
                  {paymentMethod === 'wallet' ? (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              ) : null}
              {availableGateways.map((gw) => {
                const isSelected = paymentMethod === gw.gateway;
                return (
                  <button
                    key={gw.gateway}
                    type="button"
                    onClick={() => setPaymentMethod(gw.gateway)}
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
                      ) : gw.gateway === 'paypal' ? (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
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
            {paymentMethod === 'wallet' && showCustomerWallet && !customerWalletSufficient ? (
              <p className="mt-2 text-xs font-medium text-red-600">{t('insufficientWalletCustomer')}</p>
            ) : null}
            {paymentMethod === 'bank_transfer' && (
              <div className="mt-3"><BankTransferDetails /></div>
            )}
          </Card>
        ) : gatewaysLoaded && availableGateways.length === 0 ? (
          <Card>
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{t('noGateways')}</span>
            </div>
          </Card>
        ) : null}

        {error ? <ErrorBox message={error} onRetry={() => setError(null)} /> : null}
      </div>

      {/* ─── Sidebar Summary ─── */}
      <div className="space-y-4">
        <div className="lg:sticky lg:top-6 space-y-4">
          <Card className="bg-zinc-50">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">
              {isAgentMode ? t('agentPricingTitle') : t('bookingSummary')}
            </h3>
            <div className="space-y-3 text-sm">
              {false ? (
                <>
                  {/* Markup breakdown — removed with the sessionStorage markup channel (Phase 9) */}
                </>
              ) : (
                <>
                  {/* Customer summary (unchanged) */}
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>{t('roomLabel')}</span>
                    <span className="font-medium text-zinc-900 text-right">{props.roomName || t('standardRoomDefault')}</span>
                  </div>
                  {props.boardName ? (
                    <div className="flex items-center justify-between text-zinc-600">
                      <span>{t('board')}</span>
                      <span className="font-medium text-zinc-900">{props.boardName}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>{t('duration')}</span>
                    <span className="font-medium text-zinc-900">{t('nightsCount', { count: nights })}</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>{t('guests')}</span>
                    <span className="font-medium text-zinc-900">{totalGuests}</span>
                  </div>

                  <div className="border-t border-zinc-200 pt-3">
                    <div className="flex items-center justify-between text-zinc-600">
                      <span>{t('rateLabel')}</span>
                      <span>
                        {verifying ? (
                          <span className="text-xs text-zinc-400 animate-pulse">{t('verifyingShort')}</span>
                        ) : (
                          <span className="font-medium text-zinc-900">
                            {formatPrice(currentPrice, currentCurrency)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                      <span>{t('perNightLabel')}</span>
                      <span>
                        {formatPrice(currentPrice / nights, currentCurrency)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Button
            onClick={handleCheckout}
            loading={checkoutMutation.isPending || isAgentSubmitting || verifying}
            disabled={verifying || (isCustomer && paymentMethod === 'wallet' && !!customerWallet && !customerWalletSufficient) || (isAgentMode && agentPaymentMethod === 'wallet' && !!agentWallet && !agentWalletSufficient)}
            className="w-full"
            size="lg"
          >
            {isAgentMode ? (
              agentPaymentMethod === 'wallet'
                ? t('payWalletButton', { price: formatPrice(currentPrice, currentCurrency) })
                : t('payProviderButton', { price: formatPrice(currentPrice, currentCurrency), provider: gatewayLabel(agentCardGateway).title })
            ) : verifying ? (
              t('verifyingPriceButton')
            ) : checkoutMutation.isPending ? (
              t('processingButton')
            ) : (
              t('payMethodButton', {
                price: formatPrice(currentPrice, currentCurrency),
                method: paymentMethod === 'wallet' ? t('walletOption') : paymentMethod === 'stripe' ? t('cardOption') : 'PayPal',
              })
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
