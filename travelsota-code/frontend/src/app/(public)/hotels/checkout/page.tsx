/**
 * @deprecated Use /booking/hotels/[rateId]/details instead (Phase 5 redesign).
 */
'use client';
import { useTranslations } from 'next-intl';
import { getCancellationPolicyView } from '@/lib/utils/cancellation-policy';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { useHotelCheckout } from '@/features/hotels/hooks';
import { validateRateApi, type ValidateRateInput } from '@/features/hotels/api/validate-rate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { useCurrency } from '@/context/CurrencyContext';
import { ErrorBox } from '@/components/ui/state/error-box';
import { LoadingBox } from '@/components/ui/state/loading-box';
import { getEnabledGateways, gatewayLabel, toCheckoutGateway, isManualGatewayKey } from '@/features/payments/api/get-gateway-config';
import type { GatewayListItem } from '@/features/payments/api/get-gateway-config';
import { useAuth } from '@/hooks/useAuth';
import { PriceBreakdownNote } from '@/components/shared/price-breakdown-note';
import { BankTransferDetails } from '@/components/booking/bank-transfer-details';
import {
  GuestTypeSelector,
  PaymentMethodCard,
  BookingSummarySidebar,
  ProgressStepper,
} from '@/features/hotels/components/checkout';
import {
  getFormState,
  saveFormState,
  advanceToPayment,
} from '@/features/hotels/utils/checkout-flow-state';

const ease = [0.16, 1, 0.3, 1] as const;

function sectionAnimation(index: number) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.05 + index * 0.08, duration: 0.45, ease },
  };
}

interface GuestDraft {
  roomId: string;
  name: string;
  lastName: string;
  age: string;
  title: string;
}

interface GuestMeta {
  roomLabel: string;
  isLead: boolean;
  isAdult: boolean;
  adultIndex: number;
  childIndex: number;
}

interface RoomInfo {
  roomId: string;
  adults: number;
  children: number;
}

function parseRooms(adultsStr: string, childrenStr: string): RoomInfo[] {
  const adultsArr = adultsStr.split(',').map(Number);
  const childrenArr = childrenStr.split(',').map(Number);
  const maxRooms = Math.max(adultsArr.length, childrenArr.length);
  return Array.from({ length: maxRooms }, (_, i) => ({
    roomId: String(i + 1),
    adults: adultsArr[i] || 1,
    children: childrenArr[i] || 0,
  }));
}

function buildGuestList(rooms: RoomInfo[], childAgesPerRoom?: number[][]): GuestDraft[] {
  const guests: GuestDraft[] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    const room = rooms[ri];
    const ages = childAgesPerRoom?.[ri] ?? [];
    for (let i = 0; i < room.adults; i++) {
      guests.push({ roomId: room.roomId, name: '', lastName: '', age: '', title: '' });
    }
    for (let i = 0; i < room.children; i++) {
      const prefilledAge = ages[i] != null && Number.isFinite(ages[i]) ? String(ages[i]) : '';
      guests.push({ roomId: room.roomId, name: '', lastName: '', age: prefilledAge, title: '' });
    }
  }
  return guests;
}

function buildGuestMeta(rooms: RoomInfo[]): GuestMeta[] {
  const meta: GuestMeta[] = [];
  let globalRoom = 0;
  for (const room of rooms) {
    globalRoom++;
    const roomLabel = rooms.length > 1 ? `Room ${globalRoom}` : '';
    for (let i = 0; i < room.adults; i++) {
      meta.push({
        roomLabel,
        isLead: globalRoom === 1 && i === 0,
        isAdult: true,
        adultIndex: i,
        childIndex: 0,
      });
    }
    for (let i = 0; i < room.children; i++) {
      meta.push({
        roomLabel,
        isLead: false,
        isAdult: false,
        adultIndex: 0,
        childIndex: i,
      });
    }
  }
  return meta;
}

const COUNTRY_CODES = ['+1', '+44', '+92', '+971', '+966', '+91', '+81', '+61', '+49', '+33'];

function StripeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function PayPalIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function UserVerifiedBadge() {
  return (
    <svg className="h-4 w-4 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function HotelCheckoutInner() {
  const t = useTranslations('Checkout');
  const tb = useTranslations('Booking');
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const checkoutMutation = useHotelCheckout();
  const { formatPrice, selectedCurrency } = useCurrency();
  const { isAuthenticated, isAgent, user } = useAuth();

  const hotelId = searchParams.get('hotelId') ?? '';
  const searchKey = searchParams.get('searchKey') ?? '';
  const rateId = searchParams.get('rateId') ?? '';
  const roomName = searchParams.get('roomName') ?? '';
  const boardName = searchParams.get('boardName') ?? '';
  const fromPrice = searchParams.get('price') ?? '0';
  const currency = searchParams.get('currency') ?? 'EUR';
  const roomAdults = searchParams.get('room_adults') ?? '1';
  const roomChildren = searchParams.get('room_children') ?? '0';
  const roomChildAges = searchParams.get('room_child_ages') ?? '[]';
  const checkIn = searchParams.get('checkIn') ?? '';
  const checkOut = searchParams.get('checkOut') ?? '';
  const hotelName = searchParams.get('hotelName') ?? '';
  const destination = searchParams.get('destination') ?? '';
  const provider = searchParams.get('provider') ?? '';
  const providerHotelId = searchParams.get('providerHotelId') ?? '';

  const restoredForm = getFormState();

  const rooms = parseRooms(roomAdults, roomChildren);
  const guestMeta = buildGuestMeta(rooms);

  // Parse child ages from URL for pre-filling age fields
  const parsedChildAges = (() => {
    try {
      const arr = JSON.parse(roomChildAges);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  })();

  const [isGuest, setIsGuest] = useState(restoredForm.isGuest);
  const [holderTitle, setHolderTitle] = useState(restoredForm.holderTitle);
  const [holderName, setHolderName] = useState(() =>
    restoredForm.holderName || (isAuthenticated && user ? user.firstName ?? '' : ''),
  );
  const [holderLastName, setHolderLastName] = useState(() =>
    restoredForm.holderLastName || (isAuthenticated && user ? user.lastName ?? '' : ''),
  );
  const [holderEmail, setHolderEmail] = useState(() =>
    restoredForm.holderEmail || (isAuthenticated && user ? user.email ?? '' : ''),
  );
  const [holderPhone, setHolderPhone] = useState(restoredForm.holderPhone);
  const [holderCountryCode, setHolderCountryCode] = useState(restoredForm.holderCountryCode || COUNTRY_CODES[0]);
  const [bookingForSomeoneElse, setBookingForSomeoneElse] = useState(restoredForm.bookingForSomeoneElse);
  const [specialRequests, setSpecialRequests] = useState(restoredForm.specialRequests);
  const [agreeTerms, setAgreeTerms] = useState(restoredForm.agreeTerms);

  const [guests, setGuests] = useState<GuestDraft[]>(() => {
    const initial = buildGuestList(rooms, parsedChildAges);
    const savedGuests = restoredForm.guests;
    if (savedGuests && savedGuests.length > 0) {
      return initial.map((g, i) => {
        const saved = savedGuests[i];
        return saved ? { ...g, name: saved.name, lastName: saved.lastName, age: saved.age, title: saved.title } : g;
      });
    }
    if (isAuthenticated && user) {
      return initial.map((g, i) => {
        if (!restoredForm.bookingForSomeoneElse && i === 0) {
          return {
            ...g,
            title: '',
            name: user.firstName ?? '',
            lastName: user.lastName ?? '',
          };
        }
        return g;
      });
    }
    return initial;
  });

  const [paymentMethod, setPaymentMethod] = useState<string>('stripe');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [verifiedPrice, setVerifiedPrice] = useState<{ net: number; currency: string } | null>(null);
  const [verifiedSupplier, setVerifiedSupplier] = useState<{ amount: number | null; currency: string } | null>(null);
const [verifiedPolicies, setVerifiedPolicies] = useState<Array<{
  amount?: string | number;
  from?: string;
  to?: string;
  percentage?: string | number;
  numberOfNights?: number;
}>>([]);
const [aggregatedPolicy, setAggregatedPolicy] = useState<import('@/lib/schema/hotel').AggregatedPolicy | null>(null);
const cancellationView = getCancellationPolicyView({
  cancellationPolicies: verifiedPolicies as import('@/lib/utils/cancellation-policy').CancellationPolicy[],
});
  const [availableGateways, setAvailableGateways] = useState<GatewayListItem[]>([]);
  const [gatewaysLoaded, setGatewaysLoaded] = useState(false);

  const parsedPrice = Number(fromPrice) || 0;
  const nights = checkIn && checkOut
    ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
    : 1;

  useEffect(() => {
    let cancelled = false;
    getEnabledGateways().then((gateways) => {
      if (cancelled) return;
      const enabled = gateways.filter((g) => g.enabled);
      setAvailableGateways(enabled);
      setGatewaysLoaded(true);
      if (enabled.length > 0 && enabled[0].gateway !== 'stripe') {
        setPaymentMethod(enabled[0].gateway);
      }
    }).catch(() => {
      if (!cancelled) setGatewaysLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!rateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerifying(false);
      return;
    }
    let cancelled = false;
    setVerifying(true);

    const validateInput: ValidateRateInput = {
      rateId,
      ...(searchKey ? { searchKey } : {}),
      ...(provider ? { provider } : {}),
      ...(providerHotelId ? { providerHotelId } : {}),
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      displayCurrency: selectedCurrency.code,
    };

    validateRateApi(validateInput)
      .then((res) => {
        if (cancelled) return;
        // Use the customer (marked-up) display amount — matches the hotel
        // detail page and the amount actually charged. supplierAmount is the
        // net supplier price and is always lower.
        const totalNet = res.displayAmount ?? res.supplierAmount ?? 0;
        setVerifiedPrice({
          net: totalNet,
          currency: res.displayCurrency ?? res.supplierCurrency ?? 'EUR',
        });
        setVerifiedSupplier({
          amount: (res as any).supplierAmountInDisplay ?? res.supplierAmount ?? null,
          currency: res.displayCurrency ?? res.supplierCurrency ?? 'EUR',
        });
        const policies = (res.rooms ?? [])
          .flatMap((room) => (room.rates ?? []).flatMap((r) => r.cancellationPolicies ?? []))
          .filter((p) => p && (p.amount != null || p.percentage != null || p.numberOfNights != null));
        setVerifiedPolicies(policies);
        setAggregatedPolicy(res.aggregatedPolicy ?? null);
        setVerifying(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || t('rateValidationFailed'));
          setVerifying(false);
        }
      });
    return () => { cancelled = true; };
  }, [rateId, searchKey, provider, providerHotelId, selectedCurrency.code, t]);

  function updateGuest(index: number, key: keyof GuestDraft, value: string) {
    setGuests((current) => current.map((g, i) => (i === index ? { ...g, [key]: value } : g)));
  }

  const isDev = process.env.NODE_ENV !== 'production';

  function fillSampleData() {
    const samples = [
      { name: 'Adam', lastName: 'Walker', age: '34', title: 'Mr' },
      { name: 'Sara', lastName: 'Khan', age: '31', title: 'Mrs' },
      { name: 'Omar', lastName: 'Reed', age: '36', title: 'Mr' },
      { name: 'Maya', lastName: 'Stone', age: '28', title: 'Ms' },
      { name: 'Leo', lastName: 'Patel', age: '12', title: 'Mr' },
      { name: 'Emma', lastName: 'Clark', age: '7', title: 'Miss' },
    ];
    setHolderName(samples[0].name);
    setHolderLastName(samples[0].lastName);
    setHolderEmail('adam.walker@example.com');
    setHolderPhone('3001234567');
    setGuests((current) =>
      current.map((g, i) => {
        const s = samples[(i + 1) % samples.length];
        return { ...g, name: s.name, lastName: s.lastName, age: s.age, title: s.title };
      }),
    );
  }

  function persistFormState() {
    saveFormState({
      isGuest,
      holderTitle,
      holderName,
      holderLastName,
      holderEmail,
      holderPhone,
      holderCountryCode,
      bookingForSomeoneElse,
      guests: guests.map((g) => ({ name: g.name, lastName: g.lastName, age: g.age, title: g.title })),
      specialRequests,
      agreeTerms,
    });
  }

  function validate(): string | null {
    if (!holderName.trim() || !holderLastName.trim()) return t('holderNameRequired');
    if (!holderEmail.trim()) return t('holderEmailRequired');
    for (let i = 0; i < guests.length; i++) {
      if (!guests[i].name.trim() || !guests[i].lastName.trim()) return t('guestNameRequired', { index: i + 1 });
    }
    if (!agreeTerms) return t('acceptTermsRequired');
    return null;
  }

  async function handleCheckout() {
    setError(null);
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    persistFormState();

    try {
      const res = await checkoutMutation.mutateAsync({
        rateKey: rateId,
        rateId,
        searchKey,
        hotelId,
        provider: provider || undefined,
        providerHotelId: providerHotelId || undefined,
        holder: { name: holderName.trim(), surname: holderLastName.trim() },
        clientReference: holderEmail.trim(),
        paxes: guests.map((g) => ({
          roomId: g.roomId,
          type: g.age.trim() && Number(g.age) < 18 ? 'CHILD' : 'ADULT',
          name: g.name.trim(),
          surname: g.lastName.trim(),
        })),
        gateway: toCheckoutGateway(paymentMethod),
        currency: selectedCurrency.code,
        hotelName: hotelName || undefined,
        roomName: roomName || undefined,
        boardName: boardName || undefined,
      });

      // Manual methods hold the booking — bank details + receipt + confirm
      // continue on the checkout page.
      if (isManualGatewayKey(paymentMethod)) {
        sessionStorage.setItem('checkout_data', JSON.stringify({
          paymentId: res.paymentId,
          bookingId: res.bookingId,
          bookingType: 'hotel',
          amount: res.amount,
          currency: res.currency,
          clientSecret: null,
          checkoutUrl: null,
          hotelName,
          roomName,
          paymentMethod,
          rateId,
          searchKey,
        }));
        toast.success(t('bookingHeldTitle'), t('bookingHeldDesc'));
        router.push(`/checkout/${res.paymentId}`);
        return;
      }

      sessionStorage.setItem('checkout_data', JSON.stringify({
        paymentId: res.paymentId,
        bookingId: res.bookingId,
        bookingType: 'hotel',
        amount: res.amount,
        currency: res.currency,
        clientSecret: res.clientSecret ?? null,
        checkoutUrl: res.checkoutUrl ?? null,
        hotelName,
        roomName,
        paymentMethod,
        rateId,
        searchKey,
      }));

      advanceToPayment({
        paymentId: res.paymentId,
        bookingId: res.bookingId,
        amount: res.amount,
        currency: res.currency,
        clientSecret: res.clientSecret ?? null,
        checkoutUrl: res.checkoutUrl ?? null,
        hotelName,
        roomName,
        paymentMethod,
        rateId,
        searchKey,
        isAgent,
      });

      toast.success(tb('checkoutInitiated'), tb('redirectingToPayment'));
      router.push(`/checkout/${res.paymentId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : tb('checkoutFailed');
      setError(message);
      toast.error(tb('checkoutFailedTitle'), message);
    }
  }

  if (!rateId) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <ErrorBox message={t('noRateSelected')} />
      </div>
    );
  }

  const currentPrice = verifiedPrice?.net ?? parsedPrice;
  const currentCurrency = verifiedPrice?.currency ?? currency;
  const pricePerNight = nights > 0 ? Math.round(currentPrice / nights) : currentPrice;

  const userInitials = user
    ? `${user.firstName?.charAt(0) ?? ''}${user.lastName?.charAt(0) ?? ''}`.toUpperCase()
    : '';

  let animIndex = 0;

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-zinc-50/50 via-white to-white"
      style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-6 lg:py-10">
        {/* Progress Stepper */}
        <motion.div {...sectionAnimation(animIndex++)} className="mb-8">
          <ProgressStepper current="details" />
        </motion.div>

        <div className="lg:grid lg:grid-cols-[1fr_420px] lg:gap-10">
          {/* Left Column — Form */}
          <div className="space-y-6">
            {/* Guest Type / Auth Badge */}
            <motion.section {...sectionAnimation(animIndex++)}>
              {isAuthenticated && user ? (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="overflow-hidden rounded-2xl border border-brand-teal/20 bg-brand-teal/5 p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white">
                      {userInitials || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-charcoal truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <UserVerifiedBadge />
                          {t('verifiedBadge')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
                    </div>
                    {isAgent ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        {t('agentBadge')}
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              ) : (
                <GuestTypeSelector isGuest={isGuest} onChange={setIsGuest} />
              )}
            </motion.section>

            {/* Contact Details */}
            <motion.section {...sectionAnimation(animIndex++)}>
              <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_12px_rgba(3,61,74,0.04)]">
                <div className="border-b border-zinc-100 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-charcoal tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                    {t('contactDetails')}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{t('contactDetailsDesc')}</p>
                </div>
                <div className="p-5">
                  {/* Title, Name, LastName */}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-600">{t('title')}</label>
                      <select
                        value={holderTitle}
                        onChange={(e) => setHolderTitle(e.target.value)}
                        className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-charcoal focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20"
                      >
                        <option value="">{t('select')}</option>
                        {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <Input label={`${t('firstName')} *`} placeholder={tb('firstNamePlaceholder')} value={holderName} onChange={(e) => setHolderName(e.target.value)} />
                    <Input label={`${t('lastName')} *`} placeholder={tb('lastNamePlaceholder')} value={holderLastName} onChange={(e) => setHolderLastName(e.target.value)} />
                    <Input label={`${t('email')} *`} placeholder={t('contactEmailPlaceholder')} type="email" value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} />
                  </div>

                  {/* Phone */}
                  <div className="grid gap-3 sm:grid-cols-4 mt-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-600">{t('codeLabel')}</label>
                      <select
                        value={holderCountryCode}
                        onChange={(e) => setHolderCountryCode(e.target.value)}
                        className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-charcoal focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <Input label={t('phoneNumberLabel')} placeholder={t('phonePlaceholder')} type="tel" value={holderPhone} onChange={(e) => setHolderPhone(e.target.value)} />
                    </div>
                  </div>

                  {/* Booking for someone else */}
                  <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={bookingForSomeoneElse}
                      onChange={(e) => setBookingForSomeoneElse(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-teal"
                    />
                    <span className="text-sm text-charcoal font-medium">{t('bookingForSomeoneElse')}</span>
                  </label>
                </div>
              </div>
            </motion.section>

            {/* Guest Details */}
            <motion.section {...sectionAnimation(animIndex++)}>
              <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_12px_rgba(3,61,74,0.04)]">
                <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
                  <div>
                    <h2 className="text-sm font-bold text-charcoal tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                      {t('guestDetails')}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{t('guestNamesHint')}</p>
                  </div>
                  {isDev ? (
                    <Button type="button" variant="secondary" size="sm" onClick={fillSampleData}>
                      <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                      </svg>
                      {tb('fillSampleData')}
                    </Button>
                  ) : null}
                </div>
                <div className="divide-y divide-zinc-100 p-5">
                  {/* Group guests by room */}
                  {rooms.map((room, roomIdx) => {
                    const roomGuests = guests.filter((g) => g.roomId === room.roomId);
                    const startIdx = guests.findIndex((g) => g.roomId === room.roomId);
                    const isFirstRoom = roomIdx === 0;

                    return (
                      <div key={room.roomId} className={roomIdx > 0 ? 'pt-5 mt-5 border-t border-zinc-200' : ''}>
                        {rooms.length > 1 && (
                          <div className="mb-4 flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-teal text-[11px] font-bold text-white">
                              {room.roomId}
                            </span>
                            <span className="text-sm font-semibold text-charcoal">
                              {t('roomLabel', { id: room.roomId })}
                            </span>
                            <span className="text-xs text-zinc-400">
                              ({t('roomOccupancyAdults', { count: room.adults })}
                              {room.children > 0 ? `, ${t('roomOccupancyChildren', { count: room.children })}` : ''})
                            </span>
                          </div>
                        )}

                        {roomGuests.map((guest, localIdx) => {
                          const globalIdx = startIdx + localIdx;
                          const meta = guestMeta[globalIdx];

                          const getSectionLabel = () => {
                            if (isFirstRoom && localIdx === 0) {
                              return { label: t('adultLeadTraveler', { index: 1 }), isLead: true };
                            }
                            if (meta.isAdult) {
                              return { label: t('adultLabel', { index: meta.adultIndex + 1 }), isLead: false };
                            }
                            return { label: t('childLabel', { index: meta.childIndex + 1 }), isLead: false };
                          };

                          const { label, isLead } = getSectionLabel();

                          return (
                            <div key={globalIdx} className={localIdx > 0 ? 'pt-4 mt-4 border-t border-zinc-50' : ''}>
                              <div className="flex items-center gap-2 mb-3">
                                <h3 className="text-sm font-semibold text-charcoal">{label}</h3>
                                {meta.roomLabel ? (
                                  <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                                    {meta.roomLabel}
                                  </span>
                                ) : null}
                              </div>

                              {!isLead ? (
                                <>
                                  <div className="grid gap-3 sm:grid-cols-4">
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium text-zinc-600">{t('title')}</label>
                                      <select
                                        value={guest.title}
                                        onChange={(e) => updateGuest(globalIdx, 'title', e.target.value)}
                                        className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-charcoal focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20"
                                      >
                                        <option value="">{t('select')}</option>
                                        {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map((t) => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <Input label={`${tb('firstName')} *`} placeholder={tb('firstNamePlaceholder')} value={guest.name} onChange={(e) => updateGuest(globalIdx, 'name', e.target.value)} />
                                    <Input label={`${tb('lastName')} *`} placeholder={tb('lastNamePlaceholder')} value={guest.lastName} onChange={(e) => updateGuest(globalIdx, 'lastName', e.target.value)} />
                                    <Input label={t('ageLabel')} placeholder={t('guestAgePlaceholder')} type="number" value={guest.age} onChange={(e) => updateGuest(globalIdx, 'age', e.target.value)} />
                                  </div>
                                </>
                              ) : (
                                <>
                                  {!bookingForSomeoneElse ? (
                                    <p className="text-[11px] text-zinc-400 italic mb-3">
                                      {t('leadAutofillHint')}
                                    </p>
                                  ) : null}
                                  <div className="grid gap-3 sm:grid-cols-4">
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium text-zinc-600">{t('title')}</label>
                                      <select
                                        value={guest.title}
                                        onChange={(e) => updateGuest(globalIdx, 'title', e.target.value)}
                                        disabled={!bookingForSomeoneElse}
                                        className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-charcoal focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed"
                                      >
                                        <option value="">{t('select')}</option>
                                        {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map((t) => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <Input
                                      label={`${tb('firstName')} *`}
                                      placeholder={tb('firstNamePlaceholder')}
                                      value={bookingForSomeoneElse ? guest.name : (guest.name || holderName)}
                                      onChange={(e) => bookingForSomeoneElse ? updateGuest(globalIdx, 'name', e.target.value) : null}
                                      disabled={!bookingForSomeoneElse}
                                      className={!bookingForSomeoneElse ? 'bg-zinc-50 cursor-not-allowed' : undefined}
                                    />
                                    <Input
                                      label={`${tb('lastName')} *`}
                                      placeholder={tb('lastNamePlaceholder')}
                                      value={bookingForSomeoneElse ? guest.lastName : (guest.lastName || holderLastName)}
                                      onChange={(e) => bookingForSomeoneElse ? updateGuest(globalIdx, 'lastName', e.target.value) : null}
                                      disabled={!bookingForSomeoneElse}
                                      className={!bookingForSomeoneElse ? 'bg-zinc-50 cursor-not-allowed' : undefined}
                                    />
                                    <Input label={t('ageLabel')} placeholder={t('guestAgePlaceholder')} type="number" value={guest.age} onChange={(e) => updateGuest(globalIdx, 'age', e.target.value)} />
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.section>

            {/* Payment Method */}
            <motion.section {...sectionAnimation(animIndex++)}>
              <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_12px_rgba(3,61,74,0.04)]">
                <div className="border-b border-zinc-100 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-charcoal tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                    {t('paymentMethod')}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{t('paymentMethodDesc')}</p>
                </div>
                <div className="p-5">
                  {gatewaysLoaded && availableGateways.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {availableGateways.map((gw) => (
                        <PaymentMethodCard
                          key={gw.gateway}
                          label={gatewayLabel(gw.gateway).title}
                          subtitle={gatewayLabel(gw.gateway).subtitle}
                          icon={gw.gateway === 'stripe' ? <StripeIcon /> : gw.gateway === 'paypal' ? <PayPalIcon /> : <span className="text-xs font-bold">{gatewayLabel(gw.gateway).title.slice(0, 2).toUpperCase()}</span>}
                          selected={paymentMethod === gw.gateway}
                          onClick={() => setPaymentMethod(gw.gateway)}
                        />
                      ))}
                    </div>
                  ) : gatewaysLoaded ? (
                    <p className="text-sm text-amber-700 py-2">{tb('noPaymentGateways')}</p>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-teal" />
                      {t('loadingGatewayOptions')}
                    </div>
                  )}
                  {paymentMethod === 'bank_transfer' && gatewaysLoaded && availableGateways.length > 0 ? (
                    <div className="mt-3"><BankTransferDetails /></div>
                  ) : null}
                </div>
              </div>
            </motion.section>

            {/* Special Requests */}
            <motion.section {...sectionAnimation(animIndex++)}>
              <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_12px_rgba(3,61,74,0.04)]">
                <div className="border-b border-zinc-100 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-charcoal tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                    {t('specialRequestsTitle')}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{t('specialRequestsDesc')}</p>
                </div>
                <div className="p-5 space-y-3">
                  <textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder={t('specialRequestsHotelPlaceholder')}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-charcoal placeholder:text-zinc-400 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20 resize-none"
                  />

                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-teal"
                    />
                    <span className="text-sm text-zinc-600">
                      {t('agreeTermsPrefix')}{' '}
                      <a href="/terms" className="text-brand-teal underline hover:text-brand-teal-700 transition-colors">{t('termsLink')}</a>
                      {' '}{t('agreeAnd')}{' '}
                      <a href="/privacy" className="text-brand-teal underline hover:text-brand-teal-700 transition-colors">{t('privacyLink')}</a>
                    </span>
                  </label>
                </div>
              </div>
            </motion.section>

            {/* Error */}
            {error ? (
              <motion.div {...sectionAnimation(animIndex++)}>
                <ErrorBox message={error} onRetry={() => setError(null)} />
              </motion.div>
            ) : null}

            {/* Confirm Button */}
            <motion.div {...sectionAnimation(animIndex++)}>
              <Button
                onClick={handleCheckout}
                loading={checkoutMutation.isPending || verifying}
                disabled={verifying}
                className="w-full"
                size="lg"
              >
                <span className="flex items-center gap-2">
                  {verifying ? (
                    t('verifyingAvailability')
                  ) : checkoutMutation.isPending ? (
                    t('processingPayment')
                  ) : (
                    <>
                      <LockIcon />
                      {t('confirmBookingTotal', { total: formatPrice(currentPrice, currentCurrency) })}
                    </>
                  )}
                </span>
              </Button>
              <p className="mt-3 text-center text-xs text-zinc-400">
                {t('chargeAfterConfirm')}
              </p>
            </motion.div>
          </div>

          {/* Right Sidebar */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-6 space-y-4">
              <BookingSummarySidebar
                hotelName={hotelName || t('hotelNameFallback')}
                location={destination || undefined}
                checkIn={checkIn}
                checkOut={checkOut}
                nights={nights}
                roomName={roomName || t('standardRoomFallback')}
                boardName={boardName || undefined}
                pricePerNight={pricePerNight}
                currency={currentCurrency}
                totalPrice={currentPrice}
                roomQuantity={rooms.length}
                freeCancellation={cancellationView.isFree}
                cancellationLabel={cancellationView.isFree ? undefined : cancellationView.label}
                cancellationPolicies={verifiedPolicies.length > 0 ? verifiedPolicies : undefined}
                aggregatedPolicy={aggregatedPolicy ?? undefined}
                formatPrice={formatPrice}
              />

              {verifiedSupplier?.amount != null &&
                verifiedSupplier.currency.toUpperCase() === currentCurrency.toUpperCase() &&
                currentPrice > verifiedSupplier.amount && (
                  <PriceBreakdownNote
                    supplierAmount={verifiedSupplier.amount}
                    markupAmount={currentPrice - verifiedSupplier.amount}
                    total={currentPrice}
                    currency={currentCurrency}
                    label={t('markupAdminLabel')}
                  />
                )}
              {verifying && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_2px_16px_rgba(3,61,74,0.06)]"
                >
                  <LoadingBox message={t('verifyingPrice')} />
                </motion.div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function HotelCheckoutPage() {
  const t = useTranslations('Checkout');
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-2xl py-8">
        <LoadingBox message={t('loadingCheckout')} />
      </div>
    }>
      <HotelCheckoutInner />
    </Suspense>
  );
}
