'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useCurrency } from '@/context/CurrencyContext';
import { useToast } from '@/hooks/useToast';
import { refreshAuthToken } from '@/lib/api/client';
import { retrieveOffer, clearOffer } from '@/lib/offer-bridge';
import { storeCheckoutData } from '@/lib/checkout-storage';
import { getWalletBalance } from '@/features/wallet/api/agent-wallet';
import type { WalletBalance } from '@/features/wallet/api/agent-wallet';
import { getCustomerWalletBalance } from '@/features/wallet/api/customer-wallet';
import type { CustomerWalletBalance } from '@/features/wallet/api/customer-wallet';
import { repriceBooking } from '@/features/flights/api/reprice-booking';
import { repriceFlightSnapshot, type SnapshotRepriceResponse } from '@/features/flights/api/reprice-snapshot';
import { getEnabledGateways } from '@/features/payments/api/get-gateway-config';
import type { GatewayListItem } from '@/features/payments/api/get-gateway-config';
import { getAgentAccess, isAllowed } from '@/features/agent/api/agent-access';
import type { FlightOfferView } from '@/lib/schema/flight';
import { BookingLayout } from '@/components/booking/booking-layout';
import { clearFormDraft, getLastUrl, loadFormDraft, saveFormDraft, saveLastUrl } from '@/lib/utils/search-cache';
import { FlightItineraryCard } from '@/components/booking/flight-itinerary-card';
import { AncillarySelectionPanel } from '@/features/flights/components/ancillary-selection-panel';
import { BankTransferIcon, PayLaterIcon } from './payment-method-icons';
import { BankTransferDetails, PayLaterInfo } from '@/components/booking/bank-transfer-details';
import type { AncillaryPriceSummary } from '@/features/flights/components/ancillary-selection-panel';
import { PromoCodeInput } from '@/components/booking/promo-code-input';
import { getGuestBookingStatus } from '@/features/admin/api/admin-settings';
import { CountrySelect } from '@/components/booking/country-select';
import { BookingDateSelect } from '@/components/booking/booking-date-select';
import { useCountries } from '@/features/reference/hooks';
import {
  MIN_BOOKING_AGE,
  isValidEmail,
  isValidName,
  isValidPhone,
  isValidDateOfBirth,
  isValidPassportExpiry,
  isValidPassportNumber,
  normalizePhoneParts,
} from '@/lib/utils/validation';

import { Button } from '@/components/ui/button';
import { PriceBreakdownNote } from '@/components/shared/price-breakdown-note';
import { FlightRateComments } from '@/features/flights/components/flight-rate-comments';

// ─── Types ──────────────────────────────────────────────────

interface FlightDetailsViewProps {
  offerId: string; from: string; to: string; departureAt: string; arrivalAt: string;
  price: number; currency: string; productId?: string; productIds?: string[];
  productSelections?: Array<{ offeringId: string; productIds: string[] }>;
  catalogUuid?: string; offeringIdentifierValue?: string; brandOfferingId?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city'; returnDate?: string; adults: number;
  searchKey?: string; provider?: string;
  /** Canonical snapshot ID forwarded from the snapshot detail page to checkout */
  snapshotId?: string;
  agentOriginalPrice?: number; agentMarkedUpPrice?: number; agentMarkupPercent?: number;
  /** Admin/agent markup visibility — supplier base + applied markup behind `price` */
  supplierBase?: number; markupAmount?: number;
  mode?: 'customer' | 'agent';
  returnOfferId?: string; returnProductId?: string; returnProductIds?: string[];
  returnCatalogUuid?: string; returnProductSelections?: Array<{ offeringId: string; productIds: string[] }>;
  baggageLabel?: string;
  /** Supplier fare rules (refund/change) from the snapshot — rendered as Rate Comments */
  fareRules?: { refundPolicy?: { allowed?: boolean | null; penaltyAmount?: number | string | null; penaltyCurrency?: string | null; penaltyPercent?: number | null; label?: string; free?: boolean | null } | null; changePolicy?: { allowed?: boolean | null; penaltyAmount?: number | string | null; penaltyCurrency?: string | null; penaltyPercent?: number | null; label?: string; free?: boolean | null } | null } | null;
}

interface TravelerData {
  title: string; givenName: string; surname: string; nationality: string;
  birthDay: string; birthMonth: string; birthYear: string;
  passportNumber: string; passportExpiryDay: string; passportExpiryMonth: string; passportExpiryYear: string;
}

// ─── Constants ──────────────────────────────────────────────

const ease = [0.16, 1, 0.3, 1] as const;
const sectionAnim = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease } };
const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const inputBase = 'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all duration-150 placeholder:text-zinc-400';
const inputIdle = 'border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/10';
const inputClass = `${inputBase} ${inputIdle}`;

function fieldStateClass(error?: string, valid?: boolean): string {
  if (error) return 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500/20';
  if (valid) return 'border-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20';
  return inputIdle;
}
const inputClassFor = (error?: string, valid?: boolean) => `${inputBase} ${fieldStateClass(error, valid)}`;

function nonEmpty(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// ─── Icons ──────────────────────────────────────────────────

function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);
}
function ShieldIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>);
}
function CardIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>);
}
function PayPalIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" /></svg>);
}
function EditIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>);
}

// ─── Helpers ────────────────────────────────────────────────

function createEmptyTraveler(): TravelerData {
  return {
    title: '',
    givenName: '',
    surname: '',
    nationality: 'AE',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    passportNumber: '',
    passportExpiryDay: '',
    passportExpiryMonth: '',
    passportExpiryYear: '',
  };
}

function datePartsToInputValue(day: string, month: string, year: string): string {
  const monthIndex = MONTHS.indexOf(month);
  if (!day || monthIndex < 0 || !/^\d{4}$/.test(year)) return '';
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

function localDateInputValue(daysFromToday = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateFull(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Field Component ────────────────────────────────────────

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-field-error={error ? 'true' : undefined}>
      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}{required ? <span className="text-red-500 ml-0.5">*</span> : null}</label>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs font-medium text-red-600" role="alert">
          <svg className="mt-px h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 01-18 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          {error}
        </p>
      ) : null}
    </div>
  );
}
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-4">{children}</h2>;
}

// ─── Payment Method Card ────────────────────────────────────

function PaymentMethodCard({ selected, onClick, icon, title, subtitle, disabled }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; disabled?: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.button type="button" onClick={onClick} disabled={disabled} whileHover={disabled ? undefined : { y: -1 }} whileTap={disabled ? undefined : { scale: 0.98 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease }} className={`relative flex flex-col items-center gap-2.5 rounded-lg border-2 p-4 text-center transition-all duration-150 ${disabled ? 'opacity-40 cursor-not-allowed border-zinc-100 bg-zinc-50' : selected ? 'border-zinc-900 bg-zinc-900/[0.02]' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}>
      {selected && !disabled ? <motion.span initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900"><svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></motion.span> : null}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${selected && !disabled ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{icon}</div>
      <div><p className="text-sm font-semibold text-zinc-900">{title}</p><p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p></div>
    </motion.button>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function FlightDetailsView(props: FlightDetailsViewProps) {
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, user, isAgent, isAdmin } = useAuth();
  const isCustomer = isAuthenticated && !isAgent && !isAdmin;
  const { selectedCurrency, convertAmount, formatPrice, formatPriceRaw } = useCurrency();
  const reducedMotion = useReducedMotion();
  const { data: countries = [] } = useCountries();
  const tBooking = useTranslations('Booking');
  const tCheckout = useTranslations('Checkout');

  // Guest booking setting
  const [guestBookingEnabled, setGuestBookingEnabled] = useState(true);
  useEffect(() => {
    getGuestBookingStatus()
      .then((res) => setGuestBookingEnabled(res.enabled))
      .catch(() => {});
  }, []);

  // Remember this snapshot URL so checkout's back button can return here.
  useEffect(() => {
    saveLastUrl('flight-details', window.location.pathname + window.location.search);
  }, []);

  // ── Ancillary totals (lifted from AncillarySelectionPanel) ──
  const [ancillarySummary, setAncillarySummary] = useState<AncillaryPriceSummary>({
    seats: 0, baggage: 0, services: 0, meals: 0, total: 0, currency: props.currency,
  });

  // Lazy-load extras: user fills traveler details first, then clicks this button
  // to fetch the ancillary catalog and display Seat/Baggage/Meal/Services tiles.
  const [showExtras, setShowExtras] = useState(true);

  const bridgeData = useMemo(() => retrieveOffer(), []);

  // Live repriced fare (re-validated on page load so the price shown here
  // matches what checkout will charge). Falls back to the search price until
  // the reprice resolves, and to the original price if reprice fails.
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveBasePrice, setLiveBasePrice] = useState<number | null>(null);
  // QA R4: what checkout actually charges (native supplier currency from reprice)
  const [chargePrice, setChargePrice] = useState<{ amount: number; currency: string } | null>(null);
  const [repriceLoading, setRepriceLoading] = useState(true);
  const [repriceError, setRepriceError] = useState<string | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [freshRepriceAvailable, setFreshRepriceAvailable] = useState(false);
  const [liveFareRules, setLiveFareRules] = useState<SnapshotRepriceResponse['fareRules'] | null>(null);
  // The live price response carries the authoritative fare conditions; the
  // search-time policy (props.fareRules) is only a partial view.
  const refundPolicyView = liveFareRules?.refundPolicy ?? props.fareRules?.refundPolicy ?? null;
  const changePolicyView = liveFareRules?.changePolicy ?? props.fareRules?.changePolicy ?? null;
  const [liveMarkup, setLiveMarkup] = useState<{ supplier: number | null; markup: number | null } | null>(null);

  const displayPrice =
    livePrice ?? (isAgent ? (props.agentMarkedUpPrice ?? props.price) : props.price);
  const basePrice =
    liveBasePrice ?? (isAgent ? (props.agentOriginalPrice ?? props.price) : props.price);

  // livePrice comes back in selectedCurrency.code (reprice called with
  // displayCurrency: selected). The props.price fallback is in props.currency
  // (snapshot amount) — rendering it via formatPrice(x, selectedCurrency.code)
  // would mislabel a raw supplier amount as converted (e.g. INR 10000 as
  // "10,000 USD"). Normalize to selected currency first so every downstream
  // render + total treats these as already-in-selected amounts.
  const priceIsLive = livePrice != null;
  const displayInSelected = priceIsLive ? displayPrice : convertAmount(displayPrice, props.currency);
  const baseInSelected = liveBasePrice != null ? basePrice : convertAmount(basePrice, props.currency);

  // Convert ancillary total from its currency to the display currency for the grand total
  const ancillaryTotalInDisplayCurrency = ancillarySummary.total > 0
    ? ancillarySummary.currency === selectedCurrency.code
      ? ancillarySummary.total
      : convertAmount(ancillarySummary.total, ancillarySummary.currency)
    : 0;
  const grandTotal = Math.round((displayInSelected + ancillaryTotalInDisplayCurrency) * 100) / 100;

  const bridgeOffer = bridgeData?.offer;
  const bridgeMatchesRoute = !!bridgeOffer
    && (!props.productId
      || bridgeOffer.productId === props.productId
      || bridgeOffer.productIds?.includes(props.productId)
      || bridgeOffer.offerId?.includes(props.productId))
    && (!props.catalogUuid || bridgeOffer.catalogUuid === props.catalogUuid);
  const bridgeFallbackOffer = bridgeMatchesRoute ? bridgeOffer : undefined;
  const propOfferId = nonEmpty(props.offerId);
  const bridgeOfferId = nonEmpty(bridgeFallbackOffer?.offerId);
  const isTravelport = (props.provider ?? bridgeFallbackOffer?.provider ?? 'travelport').toLowerCase() === 'travelport';
  const effectiveOfferId =
    propOfferId && (!isTravelport || propOfferId.includes(':'))
      ? propOfferId
      : bridgeOfferId;
  const effectiveSearchKey = nonEmpty(props.searchKey) ?? (bridgeMatchesRoute ? nonEmpty(bridgeData?.searchKey) : undefined);
  const effectiveCatalogUuid = nonEmpty(props.catalogUuid) ?? nonEmpty(bridgeFallbackOffer?.catalogUuid);
  const effectiveProductIds = props.productIds ?? bridgeFallbackOffer?.productIds;
  const effectiveProductSelections = props.productSelections ?? bridgeFallbackOffer?.productSelections;
  const hasInvalidOfferId = isTravelport && !!effectiveOfferId && !effectiveOfferId.includes(':');
  const isIncomplete = !effectiveSearchKey || !effectiveOfferId || hasInvalidOfferId;
  const isSnapshotFlow = !!props.snapshotId;

  useEffect(() => {
    // Phase 14: When snapshotId is present, reprice exclusively from the snapshot.
    // No raw Travelport identifiers are sent to the backend.
    if (isSnapshotFlow) {
      let cancelled = false;
      repriceFlightSnapshot({
        snapshotId: props.snapshotId!,
        displayCurrency: selectedCurrency.code,
        totalPrice: props.price,
      })
        .then((res) => {
          if (cancelled) return;
          setLivePrice(res.displayPrice);
          setLiveBasePrice(res.amount);
          setChargePrice(res.chargeAmount != null && res.chargeCurrency ? { amount: res.chargeAmount, currency: res.chargeCurrency } : null);
          setLiveMarkup({
            supplier: res.supplierBase ?? null,
            markup: res.markupAmount ?? null,
          });
          setPriceChanged(res.priceChanged);
          setFreshRepriceAvailable(res.freshRepriceAvailable);
          setLiveFareRules(res.fareRules ?? null);
          setRepriceError(null);
          setRepriceLoading(false);
        })
        .catch((err: any) => {
          if (cancelled) return;
          setRepriceError(err?.message || tCheckout('fareUnavailableReprice'));
          setRepriceLoading(false);
        });
      return () => { cancelled = true; };
    }

    if (isIncomplete) {
      setRepriceError(tCheckout('sessionExpiredSearch'));
      setRepriceLoading(false);
      return;
    }
    let cancelled = false;
    repriceBooking({
      offerId: effectiveOfferId,
      searchKey: effectiveSearchKey,
      catalogUuid: effectiveCatalogUuid,
      productSelections:
        props.returnProductSelections && props.returnProductSelections.length
          ? [...(effectiveProductSelections ?? []), ...(props.returnProductSelections ?? [])]
          : effectiveProductSelections,
      from: props.from,
      to: props.to,
      departureDate: props.departureAt?.slice(0, 10),
      currency: selectedCurrency.code,
      totalPrice: props.price,
      tripType: props.tripType as 'one_way' | 'round_trip',
    })
      .then((res) => {
        if (cancelled) return;
        setLivePrice(res.displayPrice);
        setLiveBasePrice(res.amount);
        setChargePrice(res.chargeAmount != null && res.chargeCurrency ? { amount: res.chargeAmount, currency: res.chargeCurrency } : null);
        setLiveMarkup({
          supplier: res.supplierBase ?? null,
          markup: res.markupAmount ?? null,
        });
        setPriceChanged(res.priceChanged);
        setFreshRepriceAvailable(res.freshRepriceAvailable);
        setRepriceError(null);
        setRepriceLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const msg = err?.message ?? '';
        const isAuthError = err?.statusCode === 401
          || msg.toLowerCase().includes('session expired')
          || msg.toLowerCase().includes('unauthorized');
        if (isAuthError) {
          // Guest or expired session — fall back to the prop price silently
          setRepriceError(null);
          setLivePrice(null);
          setLiveBasePrice(null);
        } else {
          setRepriceError(msg || tCheckout('fareUnavailableReprice'));
        }
        setRepriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    effectiveCatalogUuid,
    effectiveOfferId,
    effectiveProductSelections,
    effectiveSearchKey,
    isIncomplete,
    props.departureAt,
    props.from,
    props.price,
    props.returnProductSelections,
    props.to,
    props.tripType,
    selectedCurrency.code,
    tCheckout,
  ]);


  // ── Contact ──
  const [holderTitle, setHolderTitle] = useState('');
  const [holderName, setHolderName] = useState(user?.firstName ?? '');
  const [holderLastName, setHolderLastName] = useState(user?.lastName ?? '');
  const [holderEmail, setHolderEmail] = useState(user?.email ?? '');
  const [holderPhone, setHolderPhone] = useState('');
  const [holderCountryCode, setHolderCountryCode] = useState('');
  const [holderCountryIso2, setHolderCountryIso2] = useState('');
  const [bookingForOther, setBookingForOther] = useState(false);
  const knownDialCodes = useMemo(() => countries.map((country) => country.dialCode), [countries]);
  const normalizedHolderPhone = useMemo(
    () => normalizePhoneParts(holderCountryCode, holderPhone, knownDialCodes),
    [holderCountryCode, holderPhone, knownDialCodes],
  );

  // ── Travelers ──
  const [travelers, setTravelers] = useState<TravelerData[]>(Array.from({ length: props.adults || 1 }, () => createEmptyTraveler()));
  const isSynced = isAuthenticated && !bookingForOther;
  useEffect(() => { if (isSynced && travelers.length > 0) setTravelers(prev => { const n = [...prev]; n[0] = { ...n[0], givenName: holderName, surname: holderLastName }; return n; }); }, [holderName, holderLastName, isSynced]);

  const updateTraveler = useCallback((index: number, field: keyof TravelerData, value: string) => {
    setTravelers(prev => { const n = [...prev]; n[index] = { ...n[index], [field]: value }; return n; });
  }, []);

  // Restore form draft once (survives checkout → back navigation).
  useEffect(() => {
    const draft = loadFormDraft<{
      title: string; name: string; lastName: string; email: string; phone: string;
      countryCode: string; countryIso2: string; travelers?: TravelerData[];
    }>('flight-details');
    if (!draft) return;
    const raf = requestAnimationFrame(() => {
      if (draft.title) setHolderTitle(draft.title);
      if (draft.name) setHolderName(draft.name);
      if (draft.lastName) setHolderLastName(draft.lastName);
      if (draft.email) setHolderEmail(draft.email);
      if (draft.phone) setHolderPhone(draft.phone);
      if (draft.countryCode) setHolderCountryCode(draft.countryCode);
      if (draft.countryIso2) setHolderCountryIso2(draft.countryIso2);
      if (draft.travelers?.length === travelers.length) setTravelers(draft.travelers);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form draft on every change (small payload).
  useEffect(() => {
    saveFormDraft('flight-details', {
      title: holderTitle, name: holderName, lastName: holderLastName, email: holderEmail,
      phone: holderPhone, countryCode: holderCountryCode, countryIso2: holderCountryIso2,
      travelers,
    });
  }, [holderTitle, holderName, holderLastName, holderEmail, holderPhone, holderCountryCode, holderCountryIso2, travelers]);

  const updateTravelerDateParts = useCallback((index: number, kind: 'birth' | 'passportExpiry', parts: { day: string; month: string; year: string }) => {
    setTravelers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...(kind === 'birth'
          ? { birthDay: parts.day, birthMonth: parts.month, birthYear: parts.year }
          : { passportExpiryDay: parts.day, passportExpiryMonth: parts.month, passportExpiryYear: parts.year }),
      };
      return next;
    });
  }, []);

  // ── Ancillaries ──
  const [seatProductIds, setSeatProductIds] = useState<string[]>([]);
  const [baggageProductIds, setBaggageProductIds] = useState<string[]>([]);
  const [serviceProductIds, setServiceProductIds] = useState<string[]>([]);
  const [mealSelectionIds, setMealSelectionIds] = useState<string[]>([]);

  // ── Payment ──
  type CustomerMethod = 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later' | 'wallet';
  const [paymentMethod, setPaymentMethod] = useState<CustomerMethod>('stripe');
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const isEnabled = (key: string) => gateways.some(g => g.enabled && g.gateway === key);
  const stripeAvailable = isEnabled('stripe');
  const paypalAvailable = isEnabled('paypal');
  const bankTransferAvailable = isEnabled('bank_transfer');
  const payLaterAvailable = isEnabled('pay_later');
  // Default selection follows gateway availability (async-safe: runs in the
  // fetch continuation, never as a synchronous effect body).
  useEffect(() => {
    let cancelled = false;
    getEnabledGateways()
      .then((list) => {
        if (cancelled) return;
        setGateways(list);
        const on = (key: string) => list.some((g) => g.enabled && g.gateway === key);
        const first: CustomerMethod | undefined =
          (on('stripe') ? 'stripe' : undefined) ??
          (on('paypal') ? 'paypal' : undefined) ??
          (on('bank_transfer') ? 'bank_transfer' : undefined) ??
          (on('pay_later') ? 'pay_later' : undefined);
        if (first) {
          setPaymentMethod((prev) => {
            const avail: Record<CustomerMethod, boolean> = {
              stripe: on('stripe'),
              paypal: on('paypal'),
              bank_transfer: on('bank_transfer'),
              pay_later: on('pay_later'),
              // ponytail: wallet availability tracked separately — never auto-select/deselect here
              wallet: true,
            };
            return avail[prev] ? prev : first;
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const toCheckoutGateway = (m: CustomerMethod): 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'PAY_LATER' =>
    m === 'paypal' ? 'PAYPAL' : m === 'bank_transfer' ? 'BANK_TRANSFER' : m === 'pay_later' ? 'PAY_LATER' : 'STRIPE';

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountMinor: number; finalAmountMinor: number; currency: string } | null>(null);

  // Promo quote amounts arrive in the promo's own currency — normalize to the
  // selected display currency once so every render below can treat them as
  // already-in-selected (same pattern as displayInSelected above).
  const promoDiscountInSelected = appliedPromo
    ? appliedPromo.currency === selectedCurrency.code
      ? appliedPromo.discountMinor / 100
      : convertAmount(appliedPromo.discountMinor / 100, appliedPromo.currency)
    : 0;
  const promoFinalInSelected = appliedPromo
    ? appliedPromo.currency === selectedCurrency.code
      ? appliedPromo.finalAmountMinor / 100
      : convertAmount(appliedPromo.finalAmountMinor / 100, appliedPromo.currency)
    : null;

  // ── Validation ──
  const [holderTouched, setHolderTouched] = useState<Record<string, boolean>>({});
  const [travelerTouched, setTravelerTouched] = useState<Record<string, Record<string, boolean>>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const markHolderTouched = useCallback((field: string) => {
    setHolderTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);
  const markTravelerTouched = useCallback((index: number, field: string) => {
    setTravelerTouched((prev) => {
      const row = prev[index] ?? {};
      if (row[field]) return prev;
      return { ...prev, [index]: { ...row, [field]: true } };
    });
  }, []);

  // ponytail: debounced auto-split so pasted/extension-filled numbers normalize
  // without requiring a manual blur; 700ms keeps mid-typing safe.
  useEffect(() => {
    if (!holderPhone.trim()) return;
    const parts = normalizePhoneParts(holderCountryCode, holderPhone, knownDialCodes);
    if (!parts.subscriberNumber || parts.subscriberNumber === holderPhone) return;
    const t = setTimeout(() => {
      const matchedCountry = countries.find((c) => c.dialCode.replace('+', '') === parts.countryCode);
      if (matchedCountry) {
        setHolderCountryIso2(matchedCountry.code);
        setHolderCountryCode(matchedCountry.dialCode);
      }
      setHolderPhone(parts.subscriberNumber);
    }, 700);
    return () => clearTimeout(t);
  }, [holderPhone, holderCountryCode, countries, knownDialCodes]);

  const handlePhoneBlur = useCallback(() => {
    if (holderPhone.trim() && normalizedHolderPhone.subscriberNumber) {
      const selected = countries.find((country) => country.code === holderCountryIso2);
      const selectedDialCode = selected?.dialCode.replace('+', '');
      const matchedCountry = countries.find(
        (country) => country.dialCode.replace('+', '') === normalizedHolderPhone.countryCode,
      );
      const nextCountry = selectedDialCode === normalizedHolderPhone.countryCode ? selected : matchedCountry;
      if (nextCountry) {
        setHolderCountryIso2(nextCountry.code);
        setHolderCountryCode(nextCountry.dialCode);
      }
      setHolderPhone(normalizedHolderPhone.subscriberNumber);
    }
    markHolderTouched('phone');
  }, [countries, holderCountryIso2, holderPhone, markHolderTouched, normalizedHolderPhone]);

  const holderErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!holderTitle) e.title = tBooking('selectTitle');
    if (!holderCountryCode) e.countryCode = tBooking('selectCountryCode');
    if (!isValidName(holderName)) e.firstName = tBooking('invalidFirstNameLetters');
    if (!isValidName(holderLastName)) e.lastName = tBooking('invalidLastName');
    if (!holderEmail.trim()) e.email = tBooking('emailRequired');
    else if (!isValidEmail(holderEmail)) e.email = tBooking('invalidEmail');
    if (!holderPhone.trim()) e.phone = tBooking('phoneRequired');
    else if (!isValidPhone(holderCountryCode, holderPhone, knownDialCodes)) e.phone = tBooking('invalidPhoneIntl');
    return e;
  }, [holderTitle, holderName, holderLastName, holderEmail, holderPhone, holderCountryCode, knownDialCodes, tBooking]);

  const travelerErrors = useMemo(() => travelers.map((t, index) => {
    const e: Record<string, string> = {};
    const effectiveTitle = index === 0 && isSynced ? holderTitle : t.title;
    if (!effectiveTitle) e.title = tBooking('selectTitle');
    if (!isValidName(t.givenName)) e.givenName = tBooking('invalidFirstNameShort');
    if (!isValidName(t.surname)) e.surname = tBooking('invalidLastNameShort');
    if (!t.nationality) e.nationality = tBooking('selectNationality');
    if (!isValidDateOfBirth(t.birthDay, t.birthMonth, t.birthYear)) e.dob = tBooking('invalidDobMinAge', { minAge: MIN_BOOKING_AGE });
    if (t.passportNumber && !isValidPassportNumber(t.passportNumber)) e.passportNumber = tBooking('invalidPassportNumber');
    const hasExpiryInput = !!(t.passportExpiryDay || t.passportExpiryMonth || t.passportExpiryYear);
    if (t.passportNumber && !isValidPassportExpiry(t.passportExpiryDay, t.passportExpiryMonth, t.passportExpiryYear)) {
      e.passportExpiry = tBooking('invalidPassportExpiryFuture');
    } else if (!t.passportNumber && hasExpiryInput && !isValidPassportExpiry(t.passportExpiryDay, t.passportExpiryMonth, t.passportExpiryYear)) {
      e.passportExpiry = tBooking('invalidPassportExpiryComplete');
    }
    return e;
  }), [holderTitle, isSynced, travelers, tBooking]);

  const holderField = useCallback((field: string) => ({
    error: (!!holderErrors[field] && (!!holderTouched[field] || attemptedSubmit)) ? holderErrors[field] : undefined,
    valid: !!holderTouched[field] && !holderErrors[field],
  }), [holderErrors, holderTouched, attemptedSubmit]);
  const travelerField = useCallback((index: number, field: string) => ({
    error: (!!travelerErrors[index]?.[field] && (!!travelerTouched[index]?.[field] || attemptedSubmit)) ? travelerErrors[index]?.[field] : undefined,
    valid: !!travelerTouched[index]?.[field] && !travelerErrors[index]?.[field],
  }), [travelerErrors, travelerTouched, attemptedSubmit]);

  const checkoutTravelers = useMemo(
    () => travelers.map((traveler, index) => ({
      // Duffel takes lowercase titles only (mr/ms/mrs/miss) — normalize here;
      // backend re-normalizes as backstop.
      title: ((index === 0 && isSynced ? holderTitle : traveler.title) || 'mr').toLowerCase(),
      givenName: traveler.givenName.trim(),
      surname: traveler.surname.trim(),
      // Travelport rejects 'unspecified' (1G/4933) — derive from title.
      gender: ['ms', 'mrs', 'miss', 'mrs.'].includes(
        ((index === 0 && isSynced ? holderTitle : traveler.title) || 'mr').toLowerCase(),
      )
        ? 'Female'
        : 'Male',
      birthDate: datePartsToInputValue(traveler.birthDay, traveler.birthMonth, traveler.birthYear),
      passengerTypeCode: 'ADT',
      phoneCountryCode: normalizedHolderPhone.countryCode,
      phoneNumber: normalizedHolderPhone.subscriberNumber,
      email: holderEmail.trim(),
      nationality: traveler.nationality || undefined,
      documentNumber: traveler.passportNumber.trim() || undefined,
      expiryDate: datePartsToInputValue(traveler.passportExpiryDay, traveler.passportExpiryMonth, traveler.passportExpiryYear) || undefined,
    })),
    [holderEmail, holderTitle, isSynced, normalizedHolderPhone, travelers],
  );

  const holderValid = Object.keys(holderErrors).length === 0;
  const travelersValid = travelerErrors.every((e) => Object.keys(e).length === 0);
  const isFormValid = holderValid && travelersValid && agreeTerms;
  const canProceed = isFormValid;

  // ── Customer checkout ──
  const checkoutMutation = useApiMutation<any, any>('/flights/bookings/checkout', {
    onSuccess: (res: any) => {
      // Unified pipeline Phase 9: agent wallet bookings settle via the wallet
      // reserve-commit branch — no gateway redirect, no checkout session.
      if (res.paymentMethod === 'wallet') {
        clearFormDraft('flight-details');
        toast.success(tCheckout('bookingSubmitted'), tCheckout('bookingSubmittedDesc'));
        router.push(`/booking/${res.bookingId}/success?type=flight&mode=${isAgent ? 'agent' : 'customer'}`);
        return;
      }
      // Manual methods (bank_transfer / pay_later): continue to the checkout
      // page — bank details + receipt upload + confirm happen there.
      if (res.paymentMethod === 'BANK_TRANSFER' || res.paymentMethod === 'PAY_LATER') {
        // ponytail: key derived from server response — shared branch serves customer + agent submits
        storeCheckoutData({ paymentId: res.paymentId, bookingId: res.bookingId, bookingType: 'flight', amount: res.amount ?? grandTotal, currency: res.currency ?? selectedCurrency.code, displayAmount: res.displayAmount ?? grandTotal, displayCurrency: res.displayCurrency ?? selectedCurrency.code, clientSecret: null, checkoutUrl: null, hotelName: null, roomName: null, paymentMethod: String(res.paymentMethod).toLowerCase() as 'bank_transfer' | 'pay_later', isAgent });
        clearFormDraft('flight-details');
        toast.success(tCheckout('bookingHeld'), tCheckout('bookingHeldDesc'));
        router.push(`/checkout/${res.paymentId}${isAgent ? '?mode=agent' : ''}`);
        return;
      }
      // Charge figures come from the backend in CHARGE (supplier) currency —
      // never label them with the display code (that produced "EUR amount as
      // PKR" on the checkout page). Display figures stay in selected currency.
      storeCheckoutData({ paymentId: res.paymentId, bookingId: res.bookingId, bookingType: 'flight', amount: res.amount ?? grandTotal, currency: res.currency ?? selectedCurrency.code, displayAmount: res.displayAmount ?? grandTotal, displayCurrency: res.displayCurrency ?? selectedCurrency.code, clientSecret: res.clientSecret ?? null, checkoutUrl: res.checkoutUrl ?? null, hotelName: null, roomName: null, paymentMethod, isAgent });
      clearFormDraft('flight-details');
      toast.success(tCheckout('checkoutInitiated'), tCheckout('checkoutInitiatedDesc'));
      router.push(`/checkout/${res.paymentId}${isAgent ? '?mode=agent' : ''}`);
    },
    onError: (err: any) => {
      const msg = err?.message ?? '';
      const lower = msg.toLowerCase();
      if (lower.includes('fare is not available') || lower.includes('fare not available') || lower.includes('no longer available') || lower.includes('offer unavailable')) {
        clearOffer();
        toast.error(tCheckout('fareGone'), tCheckout('fareGoneDesc'));
        router.push('/flights/search');
        return;
      }
      toast.error(tCheckout('checkoutFailed'), msg || tCheckout('tryAgain'));
    },
  });

  const handleCustomerCheckout = useCallback(async () => {
    if (!canProceed) {
      setAttemptedSubmit(true);
      // Surface WHY the button is dead — silent early-returns look like a
      // broken button to users (nothing happens, no error, no request).
      toast.error(tBooking('completeHighlightedFields'));
      // Auto-scroll to the first field showing a validation error.
      requestAnimationFrame(() => {
        const firstError = document.querySelector<HTMLElement>('[data-field-error="true"]');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = firstError.querySelector<HTMLElement>('input, select, textarea');
          focusable?.focus({ preventScroll: true });
        }
      });
      return;
    }
    await refreshAuthToken();

    // Phase 14: When snapshotId is present, send ONLY the snapshotId as the
    // canonical identifier source. No raw Travelport identifiers (catalogUuid,
    // productIds, productSelections, searchKey) are sent — the backend loads
    // them all from the persisted snapshot.
    if (isSnapshotFlow) {
      checkoutMutation.mutate({
        snapshotId: props.snapshotId,
        tripType: props.tripType, returnDate: props.returnDate,
        travelers: checkoutTravelers,
        totalPrice: grandTotal, currency: selectedCurrency.code,
        gateway: paymentMethod === 'wallet' ? 'STRIPE' : toCheckoutGateway(paymentMethod),
        ...(paymentMethod === 'wallet' ? { paymentMethod: 'wallet' as const } : {}),
        successUrl: typeof window !== 'undefined' ? `${window.location.origin}/booking/success?type=flight` : undefined,
        cancelUrl: typeof window !== 'undefined' ? `${window.location.origin}/flights/search` : undefined,
        seatProductIds, baggageProductIds, serviceProductIds, mealSelectionIds,
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
      });
      return;
    }

    // Legacy path: send raw identifiers (for pages without a snapshotId)
    const isRoundTrip = props.tripType === 'round_trip' && props.returnOfferId;
    const mergedProductSelections = isRoundTrip
      ? [...(effectiveProductSelections ?? []), ...(props.returnProductSelections ?? [])]
      : effectiveProductSelections;
    const mergedProductIds = isRoundTrip
      ? [...(effectiveProductIds ?? []), ...(props.returnProductIds ?? [])]
      : effectiveProductIds;
    const checkoutCatalogUuid = isRoundTrip && props.returnCatalogUuid
      ? effectiveCatalogUuid
      : effectiveCatalogUuid;

    checkoutMutation.mutate({
      offerId: effectiveOfferId, from: props.from, to: props.to, departureDate: props.departureAt?.slice(0, 10),
      travelers: checkoutTravelers,
      tripType: props.tripType, returnDate: props.returnDate, catalogUuid: checkoutCatalogUuid, productId: props.productId,
      productIds: mergedProductIds, productSelections: mergedProductSelections,       totalPrice: grandTotal, currency: selectedCurrency.code,
      displayCurrency: selectedCurrency.code,
      gateway: paymentMethod === 'wallet' ? 'STRIPE' : toCheckoutGateway(paymentMethod),
      ...(paymentMethod === 'wallet' ? { paymentMethod: 'wallet' as const } : {}),
      successUrl: typeof window !== 'undefined' ? `${window.location.origin}/booking/success?type=flight` : undefined,
      cancelUrl: typeof window !== 'undefined' ? `${window.location.origin}/flights/offers/${encodeURIComponent(effectiveOfferId ?? props.offerId)}/details` : undefined,
      searchKey: effectiveSearchKey,
      seatProductIds,
      baggageProductIds,
      serviceProductIds,
      mealSelectionIds,
      ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
    });
  }, [canProceed, checkoutMutation, props, checkoutTravelers, grandTotal, appliedPromo, effectiveOfferId, effectiveSearchKey, effectiveCatalogUuid, effectiveProductIds, effectiveProductSelections, seatProductIds, baggageProductIds, serviceProductIds, mealSelectionIds, toCheckoutGateway, tBooking]);

  // ── Agent state ──
  const [agentPaymentMethod, setAgentPaymentMethod] = useState<'wallet' | 'card'>('wallet');
  const [agentGateway, setAgentGateway] = useState<'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'PAY_LATER'>('STRIPE');
  // Agent gateway restriction (backend enforces too): disallowed methods render disabled.
  const [agentAllowedGateways, setAgentAllowedGateways] = useState<string[] | null>(null);
  useEffect(() => {
    if (!isAgent) return;
    getAgentAccess().then((a) => setAgentAllowedGateways(a?.allowedGateways ?? null)).catch(() => {});
  }, [isAgent]);
  const agentGatewayAllowed = (key: string) => isAllowed(agentAllowedGateways, key);
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const displayPriceInWalletCurrency = displayInSelected;
  // QA R4: sufficiency is checked against what will actually be charged.
  // Wallet figures live in the wallet currency, the charge in the charge (or
  // selected) currency — convert the wallet side before comparing.
  const walletChargeAmount = chargePrice ? chargePrice.amount : displayPriceInWalletCurrency;
  const chargeCurrency = chargePrice?.currency ?? selectedCurrency.code;
  const walletCurrency = walletBalance?.currency ?? selectedCurrency.code;
  const walletTotal = walletBalance ? (walletBalance.walletBalance + walletBalance.creditAvailable) : 0;
  const walletTotalInCharge = walletCurrency === chargeCurrency ? walletTotal : convertAmount(walletTotal, walletCurrency);
  const walletSufficient = walletBalance ? walletTotalInCharge >= walletChargeAmount : false;

  useEffect(() => {
    if (!isAgent) return;
    getWalletBalance().then(setWalletBalance).catch(() => {});
  }, [isAgent]);

  // ── Customer wallet (signed-in customers only; agent logic above untouched) ──
  const [customerWallet, setCustomerWallet] = useState<CustomerWalletBalance | null>(null);
  useEffect(() => {
    if (!isCustomer) return;
    getCustomerWalletBalance().then(setCustomerWallet).catch(() => {});
  }, [isCustomer]);
  const customerWalletCurrency = customerWallet?.currency ?? selectedCurrency.code;
  const customerWalletTotal = customerWallet ? customerWallet.walletBalance + (customerWallet.creditAvailable ?? 0) : 0;
  const customerWalletTotalInSelected = customerWalletCurrency === selectedCurrency.code ? customerWalletTotal : convertAmount(customerWalletTotal, customerWalletCurrency);
  const customerWalletSufficient = customerWallet ? customerWalletTotalInSelected >= grandTotal : false;
  const showCustomerWallet = isCustomer && !!customerWallet && customerWallet.walletBalance > 0;

  const handleAgentSubmit = useCallback(async () => {
    if (!isFormValid) { setAttemptedSubmit(true); return; }
    setAgentSubmitting(true);
    await refreshAuthToken();
    // Unified pipeline Phase 9: ONE shared checkout endpoint for all roles.
    // The server resolves the caller's role — agents default to the
    // wallet/credit reserve-commit branch; the card selector sends
    // paymentMethod 'gateway' for the PaymentIntent flow. No client-side
    // price is sent — the server's agent-priced preview is authoritative.
    try {
      const shared = {
        travelers: checkoutTravelers,
        currency: selectedCurrency.code,
        gateway: agentPaymentMethod === 'card' ? agentGateway : 'STRIPE',
        ...(agentPaymentMethod === 'card' ? { paymentMethod: 'gateway' as const } : {}),
        seatProductIds, baggageProductIds, serviceProductIds, mealSelectionIds,
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
      };
      if (isSnapshotFlow) {
        // Snapshot flow: snapshotId is the canonical identifier source.
        await checkoutMutation.mutateAsync({
          snapshotId: props.snapshotId,
          tripType: props.tripType, returnDate: props.returnDate,
          ...shared,
        });
      } else {
        await checkoutMutation.mutateAsync({
          offerId: effectiveOfferId, from: props.from, to: props.to,
          departureDate: props.departureAt?.slice(0, 10),
          tripType: props.tripType, returnDate: props.returnDate,
          catalogUuid: effectiveCatalogUuid, productId: props.productId,
          productIds: effectiveProductIds, productSelections: effectiveProductSelections,
          searchKey: effectiveSearchKey,
          ...shared,
        });
      }
    } catch (err: unknown) {
      toast.error(tCheckout('bookingFailed'), err instanceof Error ? err.message : tCheckout('tryAgain'));
    } finally { setAgentSubmitting(false); }
  }, [isFormValid, checkoutTravelers, props, agentPaymentMethod, agentGateway, checkoutMutation, appliedPromo, router, toast, effectiveOfferId, effectiveCatalogUuid, effectiveProductIds, effectiveProductSelections, effectiveSearchKey, selectedCurrency.code, seatProductIds, baggageProductIds, serviceProductIds, mealSelectionIds, isSnapshotFlow, tCheckout]);

  const walletInsufficient = agentPaymentMethod === 'wallet' && !walletSufficient && !!walletBalance;
  // ── Sidebar ────────────────────────────────────────────────

  const routeLabel = `${props.from} → ${props.to}`;
  const flightDate = props.departureAt ? formatDateFull(props.departureAt) : '—';
  const cabinLabel = (bridgeData?.offer as any)?.cabin ?? (props as any).cabinClass ?? 'Economy';
  const offerSegments = (bridgeData?.offer as FlightOfferView | undefined)?.segments ?? [];
  const offerDisplay = (bridgeData?.offer as FlightOfferView | undefined)?.display;
  const firstSegment = offerSegments[0];
  const airlineName = offerDisplay?.airlineName ?? firstSegment?.display?.airlineName;
  const airlineLogo = offerDisplay?.airlineLogoUrl ?? firstSegment?.display?.airlineLogoUrl;
  const flightNumber = offerDisplay?.flightNumber ?? firstSegment?.display?.flightNumber;
  const stopsCount = offerSegments.length > 1 ? offerSegments.length - 1 : 0;
  const isNonstop = offerDisplay?.stopsLabel ? offerDisplay.stopsLabel === 'Nonstop' : stopsCount === 0;
  const stopsLabel = offerDisplay?.stopsLabel
    ? (isNonstop ? tCheckout('nonstop') : offerDisplay.stopsLabel)
    : (isNonstop ? tCheckout('nonstop') : tCheckout('stopsCount', { count: stopsCount }));
  const originLabel = offerDisplay?.origin?.label ?? firstSegment?.display?.origin?.label ?? props.from;
  const destLabel = offerDisplay?.destination?.label ?? firstSegment?.display?.destination?.label ?? props.to;
  const departTime = firstSegment?.departureAt ? formatTime(firstSegment.departureAt) : (props.departureAt ? formatTime(props.departureAt) : '');
  const arriveTime = props.arrivalAt ? formatTime(props.arrivalAt) : (firstSegment?.arrivalAt ? formatTime(firstSegment.arrivalAt) : '');

  const sidebar = (
    <motion.div {...(reducedMotion ? {} : sectionAnim)} className="space-y-4">
      {/* Flight Card */}
      <div className="border border-zinc-200 bg-white overflow-hidden">
        <div className="px-4 py-4">
          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3">{tCheckout('flightDetails')}</h3>
          {/* Airline */}
          <div className="flex items-center gap-3">
            {airlineLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- airline logo comes from provider CDN; next/image cannot optimize a dynamic URL
              <img src={airlineLogo} alt={airlineName ?? tCheckout('airlineFallback')} className="h-9 w-9 shrink-0 object-contain" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/5 text-brand-teal">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" /></svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-zinc-900">{airlineName ?? tCheckout('airlineFallback')}</p>
              {flightNumber ? <p className="text-xs text-zinc-500">{flightNumber}</p> : null}
            </div>
            <span className={`ml-auto inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${isNonstop ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'}`}>{stopsLabel}</span>
          </div>
          {/* Route */}
          <div className="mt-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-zinc-900 tabular-nums">{departTime || '—'}</p>
              <p className="truncate text-xs text-zinc-500">{originLabel}</p>
            </div>
            <div className="flex flex-col items-center px-1">
              <svg className="h-4 w-4 text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" /></svg>
              <span className="mt-0.5 text-[10px] text-zinc-400">{flightDate}</span>
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-base font-bold text-zinc-900 tabular-nums">{arriveTime || '—'}</p>
              <p className="truncate text-xs text-zinc-500">{destLabel}</p>
            </div>
          </div>
          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
            <span className="flex items-center gap-1"><svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg> {tCheckout('adultsCount', { count: props.adults })}</span>
            <span className="text-zinc-300">•</span>
            <span>{cabinLabel === 'Economy' ? tCheckout('economyCabin') : cabinLabel}</span>
            {props.tripType === 'round_trip' ? <><span className="text-zinc-300">•</span><span>{tCheckout('roundTrip')}</span></> : null}
          </div>
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="border border-zinc-200 bg-white p-4">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3">{tCheckout('priceBreakdown')}</h3>
        <div className="space-y-2 text-sm">
          {/*
            displayInSelected is already normalized into the selected currency
            (live reprice when available, client-side conversion of the
            snapshot amount otherwise) — render immediately, no skeleton wait.
          */}
          {isAgent && props.agentMarkupPercent ? (
            <>
              <div className="flex justify-between"><span className="text-zinc-600">{tCheckout('baseFare')}</span><span className="font-medium text-zinc-800">{formatPrice(baseInSelected, selectedCurrency.code)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-600">{tCheckout('markupPercent', { pct: props.agentMarkupPercent })}</span><span className="font-medium text-zinc-800">{formatPrice(displayInSelected - baseInSelected, selectedCurrency.code)}</span></div>
            </>
          ) : (
            <div className="flex justify-between"><span className="text-zinc-600">{tCheckout('flightPrice')}</span><span className="font-medium text-zinc-800">{formatPrice(displayInSelected, selectedCurrency.code)}</span></div>
          )}
          {!isAgent && !repriceLoading && (
            <PriceBreakdownNote
              supplierAmount={liveMarkup?.supplier ?? props.supplierBase}
              markupAmount={liveMarkup?.markup ?? props.markupAmount}
              total={displayInSelected}
              currency={selectedCurrency.code}
              label={tCheckout('markupAdmin')}
            />
          )}

          {/* Ancillary breakdown */}
          {ancillarySummary.seats > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-600">{tCheckout('seats')}</span>
              <span className="font-medium tabular-nums text-zinc-800">{formatPrice(ancillarySummary.seats, ancillarySummary.currency)}</span>
            </div>
          )}
          {ancillarySummary.baggage > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-600">{tCheckout('baggage')}</span>
              <span className="font-medium tabular-nums text-zinc-800">{formatPrice(ancillarySummary.baggage, ancillarySummary.currency)}</span>
            </div>
          )}
          {ancillarySummary.services > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-600">{tCheckout('extras')}</span>
              <span className="font-medium tabular-nums text-zinc-800">{formatPrice(ancillarySummary.services, ancillarySummary.currency)}</span>
            </div>
          )}

          {appliedPromo ? (
            <div className="flex justify-between"><span className="text-emerald-600">{tCheckout('promoApplied', { code: appliedPromo.code })}</span><span className="font-medium text-emerald-600">-{formatPrice(promoDiscountInSelected, selectedCurrency.code)}</span></div>
          ) : null}
          <div className="flex justify-between"><span className="text-zinc-600">{tCheckout('taxesFees')}</span><span className="font-medium text-zinc-800">{tCheckout('included')}</span></div>
          <div className="flex justify-between border-t border-zinc-100 pt-2 mt-2">
            <span className="font-bold text-zinc-900">{tCheckout('total')}</span>
            <span className="font-bold text-zinc-900 text-base">{formatPrice(promoFinalInSelected ?? grandTotal, selectedCurrency.code)}</span>
          </div>
        </div>
      </div>

      {/* Rate Comments — supplier fare conditions */}
      <FlightRateComments
        data={{
          provider: props.provider,
          refund: refundPolicyView
            ? {
                allowed: refundPolicyView.allowed,
                penaltyAmount: refundPolicyView.penaltyAmount,
                penaltyCurrency: refundPolicyView.penaltyCurrency,
                penaltyPercent: refundPolicyView.penaltyPercent,
                free: refundPolicyView.free,
              }
            : null,
          change: changePolicyView
            ? {
                allowed: changePolicyView.allowed,
                penaltyAmount: changePolicyView.penaltyAmount,
                penaltyCurrency: changePolicyView.penaltyCurrency,
                penaltyPercent: changePolicyView.penaltyPercent,
                free: changePolicyView.free,
              }
            : null,
        }}
      />

      {/* Promo Code */}
      <div className="border border-zinc-200 bg-white p-4">
        <PromoCodeInput
          productType="flights"
          context={{ routeCode: `${props.from}-${props.to}`, airlineCode: (bridgeData?.offer as any)?.airlineCode, cabinClass: cabinLabel, providerKey: props.provider }}
          onPromoApplied={setAppliedPromo}
          onPromoRemoved={() => setAppliedPromo(null)}
        />
      </div>

      {/* Trust Badges */}
      <div className="border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-zinc-600"><ShieldIcon className="h-3.5 w-3.5 text-zinc-400" /> {tCheckout('trustConfirmation')}</div>
        <div className="flex items-center gap-2 text-xs text-zinc-600"><LockIcon className="h-3.5 w-3.5 text-zinc-400" /> {tCheckout('trustSecurePayment')}</div>
        <div className="flex items-center gap-2 text-xs text-zinc-600"><svg className="h-3.5 w-3.5 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75" /></svg> {tCheckout('trustNoCharges')}</div>
      </div>
    </motion.div>
  );

  // ── Main Render ────────────────────────────────────────────

  // Back goes to the exact search (with params) the user came from.
  const backToSearch = getLastUrl('flights-search') ?? '/flights/search';

  return (
    <BookingLayout title={routeLabel} backHref={backToSearch} backLabel={tCheckout('backToSearch')} sidebar={sidebar}>
      {!isAuthenticated && !guestBookingEnabled ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">{tCheckout('signInRequired')}</h2>
              <p className="text-sm text-zinc-500">{tCheckout('signInRequiredDesc')}</p>
              <div className="flex justify-center gap-3">
                <a href={`/signin?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`}>
                  <Button size="sm">{tCheckout('signIn')}</Button>
                </a>
                <a href="/signup">
                  <Button variant="secondary" size="sm">{tCheckout('createAccount')}</Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <>
      <motion.div {...(reducedMotion ? {} : sectionAnim)} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{tCheckout('completeFlightBooking')}</h1>
        <div className="mt-2 flex items-center gap-2">
          <p className="text-sm text-zinc-500">{tCheckout('fillFlightDetails', { from: props.from, to: props.to })}</p>
          {!isAuthenticated && guestBookingEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              {tCheckout('guestBooking')}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Form ── */}
      <motion.div {...(reducedMotion ? {} : sectionAnim)}>

            {/* ── Itinerary ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.06 } })} className="mb-7">
              <SectionHeading>{tCheckout('itinerary')}</SectionHeading>
              <FlightItineraryCard segments={bridgeData?.offer?.segments ?? []} from={props.from} to={props.to} tripType={props.tripType} returnDate={props.returnDate} />
            </motion.section>

            {/* ── Guest Details ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.1 } })} className="mb-7">
              <SectionHeading>{tCheckout('guestDetails')}</SectionHeading>
              <div className="rounded-lg border border-zinc-200 bg-white p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={tCheckout('titleField')} required error={holderField('title').error}>
                    <select value={holderTitle} onChange={e => setHolderTitle(e.target.value)} onBlur={() => markHolderTouched('title')} className={inputClassFor(holderField('title').error, holderField('title').valid)}><option value="">{tCheckout('selectOption')}</option>{TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                  </Field>
                  <Field label={tCheckout('firstName')} required error={holderField('firstName').error}>
                    <input type="text" value={holderName} onChange={e => setHolderName(e.target.value)} onBlur={() => markHolderTouched('firstName')} placeholder={tCheckout('firstNamePlaceholder')} className={inputClassFor(holderField('firstName').error, holderField('firstName').valid)} />
                  </Field>
                  <Field label={tCheckout('lastName')} required error={holderField('lastName').error}>
                    <input type="text" value={holderLastName} onChange={e => setHolderLastName(e.target.value)} onBlur={() => markHolderTouched('lastName')} placeholder={tCheckout('lastNamePlaceholder')} className={inputClassFor(holderField('lastName').error, holderField('lastName').valid)} />
                  </Field>
                  <Field label={tCheckout('email')} required error={holderField('email').error}>
                    <input type="email" value={holderEmail} onChange={e => setHolderEmail(e.target.value)} onBlur={() => markHolderTouched('email')} placeholder={tCheckout('emailPlaceholder')} className={inputClassFor(holderField('email').error, holderField('email').valid)} />
                  </Field>
                  <Field label={tCheckout('countryCode')} required>
                    <CountrySelect value={holderCountryIso2} onChange={(code, country) => { setHolderCountryIso2(code); if (country) setHolderCountryCode(country.dialCode); markHolderTouched('countryCode'); }} countries={countries} mode="dial" error={holderField('countryCode').error} valid={holderField('countryCode').valid} aria-label={tCheckout('countryCodeAria')} />
                  </Field>
                  <Field label={tCheckout('phone')} required error={holderField('phone').error}>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={holderPhone}
                      onChange={e => setHolderPhone(e.target.value)}
                      onBlur={handlePhoneBlur}
                      placeholder={tCheckout('phonePlaceholder')}
                      className={inputClassFor(holderField('phone').error, holderField('phone').valid)}
                    />
                    {/* Single-field ease: paste/type a full international number and the country code above follows automatically. */}
                    {holderPhone.trim() ? (
                      <p className={`mt-1.5 text-[11px] tabular-nums ${holderField('phone').valid ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {normalizedHolderPhone.e164
                          ? `${tCheckout('phoneWillBeSentAs', { e164: normalizedHolderPhone.e164 })}${holderField('phone').valid ? ' ✓' : ''}`
                          : tCheckout('phoneHintTypeCode')}
                      </p>
                    ) : null}
                  </Field>
                </div>
                {isAuthenticated ? (
                  <label className="mt-4 flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"><input type="checkbox" checked={bookingForOther} onChange={e => setBookingForOther(e.target.checked)} className="peer sr-only" /><div className="absolute inset-0 rounded border border-zinc-300 bg-white transition-colors duration-150 peer-checked:border-brand-teal peer-checked:bg-brand-teal" /><svg className="relative h-2.5 w-2.5 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>
                    <div><span className="text-sm font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">{tCheckout('bookingForOther')}</span><p className="text-xs text-zinc-500 mt-0.5">{tCheckout('bookingForOtherDesc')}</p></div>
                  </label>
                ) : null}
              </div>
            </motion.section>

            {/* ── Passenger Details ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.14 } })} className="mb-7">
              <SectionHeading>{tCheckout('passengerDetails')}</SectionHeading>
              {travelers.map((traveler, index) => {
                const isLead = index === 0;
                const isBlocked = isSynced && isLead;
                const todayInput = localDateInputValue();
                const tomorrowInput = localDateInputValue(1);
                return (
                  <div key={`traveler-${index}`} className="mb-3 last:mb-0">
                    <div className={`rounded-lg border bg-white p-4 transition-all duration-150 ${isBlocked ? 'border-zinc-100 bg-zinc-50/50' : 'border-zinc-200'}`}>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-700">{tCheckout('travelerNumber', { index: index + 1 })}</span>
                          {isLead ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/60">{tCheckout('leadTraveler')}</span> : null}
                        </div>
                        {isBlocked ? <span className="text-[10px] text-zinc-400 italic">{tCheckout('syncedWithGuest')}</span> : null}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Field label={tCheckout('titleField')} required error={travelerField(index, 'title').error}>
                          <select value={isBlocked ? holderTitle : traveler.title} onChange={e => updateTraveler(index, 'title', e.target.value)} onBlur={() => !isBlocked && markTravelerTouched(index, 'title')} disabled={isBlocked} className={`${inputClassFor(travelerField(index, 'title').error, travelerField(index, 'title').valid)} ${isBlocked ? 'opacity-60 cursor-not-allowed' : ''}`}><option value="">{tCheckout('selectOption')}</option>{TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                        </Field>
                        <Field label={isBlocked ? tCheckout('firstNameSynced') : tCheckout('firstName')} required error={travelerField(index, 'givenName').error}>
                          <input type="text" value={isBlocked ? holderName : traveler.givenName} onChange={e => isBlocked ? setHolderName(e.target.value) : updateTraveler(index, 'givenName', e.target.value)} onBlur={() => !isBlocked && markTravelerTouched(index, 'givenName')} placeholder={tCheckout('firstNamePlaceholder')} className={`${isBlocked ? inputClass : inputClassFor(travelerField(index, 'givenName').error, travelerField(index, 'givenName').valid)} ${isBlocked ? 'bg-zinc-50 text-zinc-500 cursor-not-allowed' : ''}`} disabled={isBlocked} />
                        </Field>
                        <Field label={isBlocked ? tCheckout('lastNameSynced') : tCheckout('lastName')} required error={travelerField(index, 'surname').error}>
                          <input type="text" value={isBlocked ? holderLastName : traveler.surname} onChange={e => isBlocked ? setHolderLastName(e.target.value) : updateTraveler(index, 'surname', e.target.value)} onBlur={() => !isBlocked && markTravelerTouched(index, 'surname')} placeholder={tCheckout('lastNamePlaceholder')} className={`${isBlocked ? inputClass : inputClassFor(travelerField(index, 'surname').error, travelerField(index, 'surname').valid)} ${isBlocked ? 'bg-zinc-50 text-zinc-500 cursor-not-allowed' : ''}`} disabled={isBlocked} />
                        </Field>
                        <Field label={tCheckout('nationality')} required>
                          <CountrySelect value={traveler.nationality} onChange={(code) => updateTraveler(index, 'nationality', code)} countries={countries} mode="nationality" error={travelerField(index, 'nationality').error} valid={travelerField(index, 'nationality').valid} aria-label={tCheckout('travelerNationalityAria', { index: index + 1 })} />
                        </Field>
                        <Field label={tCheckout('dateOfBirth')} required error={travelerField(index, 'dob').error}>
                          <BookingDateSelect
                            day={traveler.birthDay}
                            month={traveler.birthMonth}
                            year={traveler.birthYear}
                            max={todayInput}
                            yearOrder="desc"
                            onChange={(parts) => { updateTravelerDateParts(index, 'birth', parts); markTravelerTouched(index, 'dob'); }}
                            error={travelerField(index, 'dob').error}
                            valid={travelerField(index, 'dob').valid}
                            ariaLabel={tCheckout('travelerDobAria', { index: index + 1 })}
                          />
                        </Field>
                        <Field label={tCheckout('passportNumber')} error={travelerField(index, 'passportNumber').error}>
                          <input type="text" value={traveler.passportNumber} onChange={e => updateTraveler(index, 'passportNumber', e.target.value)} onBlur={() => markTravelerTouched(index, 'passportNumber')} placeholder={tCheckout('passportPlaceholder')} className={inputClassFor(travelerField(index, 'passportNumber').error, travelerField(index, 'passportNumber').valid)} />
                        </Field>
                        <Field label={tCheckout('passportExpiry')} error={travelerField(index, 'passportExpiry').error}>
                          <BookingDateSelect
                            day={traveler.passportExpiryDay}
                            month={traveler.passportExpiryMonth}
                            year={traveler.passportExpiryYear}
                            min={tomorrowInput}
                            yearOrder="asc"
                            onChange={(parts) => { updateTravelerDateParts(index, 'passportExpiry', parts); markTravelerTouched(index, 'passportExpiry'); }}
                            error={travelerField(index, 'passportExpiry').error}
                            valid={travelerField(index, 'passportExpiry').valid}
                            ariaLabel={tCheckout('travelerExpiryAria', { index: index + 1 })}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.section>

            {/* ── Extras — lazy-loaded via button ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.18 } })} className="mb-7">
              {!showExtras ? (
                <div className="text-center py-6">
                  <Button
                    onClick={() => setShowExtras(true)}
                    className="rounded-xl px-6 py-3 text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                  >
                    {tCheckout('goToExtras')}
                  </Button>
                  <p className="mt-2 text-xs text-zinc-400">{tCheckout('extrasHint')}</p>
                </div>
              ) : (
                <>
                  <SectionHeading>{tCheckout('optionalServices')}</SectionHeading>
                  <AncillarySelectionPanel
                offerId={effectiveOfferId ?? props.offerId}
                searchKey={effectiveSearchKey}
                from={props.from}
                to={props.to}
                departureDate={props.departureAt?.slice(0, 10) ?? ''}
                travelerCount={props.adults || 1}
                provider={props.provider}
                seatProductIds={seatProductIds}
                baggageProductIds={baggageProductIds}
                serviceProductIds={serviceProductIds}
                mealSelectionIds={mealSelectionIds}
                onSeatProductIdsChange={setSeatProductIds}
                onBaggageProductIdsChange={setBaggageProductIds}
                onServiceProductIdsChange={setServiceProductIds}
                onMealSelectionIdsChange={setMealSelectionIds}
                onAncillaryTotalChange={setAncillarySummary}
                includedBaggageLabel={props.baggageLabel}
                supplierCurrency={props.currency}
                snapshotId={props.snapshotId}
              />
                </>
              )}
            </motion.section>

            {/* ── Payment Methods ── */}
            {!isAgent ? (
              <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.22 } })} className="mb-7">
                <SectionHeading>{tCheckout('paymentMethod')}</SectionHeading>
                {showCustomerWallet && customerWallet ? (
                  <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{tCheckout('walletBalanceIn', { currency: customerWalletCurrency })}</span>
                      <span className="font-semibold text-zinc-900">{formatPrice(customerWallet.walletBalance, customerWalletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                      <span className="font-medium text-zinc-600">{tCheckout('totalAvailableIn', { currency: customerWalletCurrency })}</span>
                      <span className={`font-bold ${customerWalletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(customerWalletTotal, customerWalletCurrency)}</span>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <PaymentMethodCard selected={paymentMethod === 'stripe' && stripeAvailable} onClick={() => setPaymentMethod('stripe')} icon={<CardIcon />} title={tCheckout('creditCard')} subtitle={tCheckout('poweredByStripe')} disabled={!stripeAvailable} />
                  <PaymentMethodCard selected={paymentMethod === 'paypal' && paypalAvailable} onClick={() => setPaymentMethod('paypal')} icon={<PayPalIcon />} title={tCheckout('digitalWallet')} subtitle={tCheckout('payWithPayPal')} disabled={!paypalAvailable} />
                  <PaymentMethodCard selected={paymentMethod === 'pay_later' && payLaterAvailable} onClick={() => setPaymentMethod('pay_later')} icon={<PayLaterIcon />} title={tCheckout('payLater')} subtitle={payLaterAvailable ? tCheckout('holdNowPayWindow') : tCheckout('disabledOption')} disabled={!payLaterAvailable} />
                  <PaymentMethodCard selected={paymentMethod === 'bank_transfer' && bankTransferAvailable} onClick={() => setPaymentMethod('bank_transfer')} icon={<BankTransferIcon />} title={tCheckout('bankTransfer')} subtitle={bankTransferAvailable ? tCheckout('transferUploadReceipt') : tCheckout('disabledOption')} disabled={!bankTransferAvailable} />
                  {showCustomerWallet ? (
                    <PaymentMethodCard selected={paymentMethod === 'wallet'} onClick={() => setPaymentMethod('wallet')} icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>} title={tCheckout('wallet')} subtitle={tCheckout('walletBalanceAmount', { balance: formatPrice(customerWalletTotal, customerWalletCurrency) })} />
                  ) : null}
                </div>
                {paymentMethod === 'wallet' && showCustomerWallet && !customerWalletSufficient ? (
                  <p className="mt-2 text-xs font-medium text-red-600">{tCheckout('walletInsufficientCustomer')}</p>
                ) : null}
                {paymentMethod === 'pay_later' && payLaterAvailable && (
                  <div className="mt-3"><PayLaterInfo /></div>
                )}
                {paymentMethod === 'bank_transfer' && bankTransferAvailable && (
                  <div className="mt-3"><BankTransferDetails /></div>
                )}
              </motion.section>
            ) : null}

            {/* ── Agent Payment ── */}
            {isAgent ? (
              <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.22 } })} className="mb-7">
                <SectionHeading>{tCheckout('agentPaymentMethod')}</SectionHeading>
                {walletBalance ? (
                  <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{tCheckout('walletBalanceIn', { currency: walletCurrency })}</span>
                      <span className="font-semibold text-zinc-900">{formatPrice(walletBalance.walletBalance, walletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{tCheckout('creditAvailableIn', { currency: walletCurrency })}</span>
                      <span className={`font-semibold ${walletBalance.creditAvailable > 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>{formatPrice(walletBalance.creditAvailable, walletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                      <span className="font-medium text-zinc-600">{tCheckout('totalAvailableIn', { currency: walletCurrency })}</span>
                      <span className={`font-bold ${walletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(walletBalance.walletBalance + walletBalance.creditAvailable, walletCurrency)}</span>
                    </div>
                  </div>
                ) : null}
                {agentPaymentMethod === 'wallet' && !walletSufficient && walletBalance ? (
                  <p className="mb-3 text-xs font-medium text-red-600">{tCheckout('walletInsufficientAgent')}</p>
                ) : null}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <PaymentMethodCard selected={agentPaymentMethod === 'wallet'} onClick={() => setAgentPaymentMethod('wallet')} disabled={!walletSufficient && !!walletBalance} icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>} title={tCheckout('wallet')} subtitle={tCheckout('payFromBalance')} />
                  <PaymentMethodCard selected={agentPaymentMethod === 'card'} onClick={() => setAgentPaymentMethod('card')} icon={<CardIcon />} title={tCheckout('card')} subtitle={tCheckout('payViaCard')} />
                </div>
                {agentPaymentMethod === 'card' && (
                  <div className="grid grid-cols-2 gap-3">
                    <PaymentMethodCard selected={agentGateway === 'STRIPE'} onClick={() => setAgentGateway('STRIPE')} icon={<CardIcon />} title={tCheckout('creditCard')} subtitle={agentGatewayAllowed('stripe') ? tCheckout('poweredByStripe') : tCheckout('disabledOption')} disabled={!agentGatewayAllowed('stripe')} />
                    <PaymentMethodCard selected={agentGateway === 'PAYPAL'} onClick={() => setAgentGateway('PAYPAL')} icon={<PayPalIcon />} title={tCheckout('digitalWallet')} subtitle={agentGatewayAllowed('paypal') ? tCheckout('payWithPayPal') : tCheckout('disabledOption')} disabled={!agentGatewayAllowed('paypal')} />
                    <PaymentMethodCard selected={agentGateway === 'BANK_TRANSFER'} onClick={() => setAgentGateway('BANK_TRANSFER')} icon={<BankTransferIcon />} title={tCheckout('bankTransfer')} subtitle={bankTransferAvailable && agentGatewayAllowed('bank_transfer') ? tCheckout('transferUploadReceipt') : tCheckout('disabledOption')} disabled={!bankTransferAvailable || !agentGatewayAllowed('bank_transfer')} />
                    <PaymentMethodCard selected={agentGateway === 'PAY_LATER'} onClick={() => setAgentGateway('PAY_LATER')} icon={<PayLaterIcon />} title={tCheckout('payLater')} subtitle={payLaterAvailable && agentGatewayAllowed('pay_later') ? tCheckout('holdNowPayWindow') : tCheckout('disabledOption')} disabled={!payLaterAvailable || !agentGatewayAllowed('pay_later')} />
                  </div>
                )}
              </motion.section>
            ) : null}

            {/* ── Special Requests ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.26 } })} className="mb-7">
              <SectionHeading>{tCheckout('specialRequests')}</SectionHeading>
              <div className="relative">
                <textarea value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} placeholder={tCheckout('specialRequestsPlaceholder')} rows={3} className={`${inputBase} ${inputIdle} resize-none`} />
                <span className="absolute right-3 top-3 text-zinc-300 pointer-events-none"><EditIcon /></span>
              </div>
            </motion.section>

            {/* ── Terms ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.3 } })} className="mb-7">
              <label
                className="flex items-start gap-3 cursor-pointer group"
                onClick={(e) => {
                  // Deterministic toggle (mirrors hotel view): default label→input
                  // forwarding is flaky inside animated sections — handle it directly.
                  e.preventDefault();
                  const t = e.target as HTMLElement;
                  if (t instanceof HTMLInputElement) return;
                  setAgreeTerms((v) => !v);
                }}
              >
                <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"><input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="peer sr-only" /><div className="absolute inset-0 rounded border border-zinc-300 bg-white transition-colors duration-150 peer-checked:border-brand-teal peer-checked:bg-brand-teal" /><svg className="relative h-2.5 w-2.5 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>
                <div>
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900 transition-colors">{tCheckout('acceptTerms')}</span>
                  <p className="text-xs text-zinc-500 mt-0.5">{tCheckout('acceptFareRules')}</p>
                </div>
              </label>
              {attemptedSubmit && !agreeTerms ? <p className="mt-2 text-xs font-medium text-red-600">{tCheckout('acceptTermsRequired')}</p> : null}
            </motion.section>

            {/* ── Reprice status ── */}
            {repriceLoading ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-teal" />
                {tCheckout('revalidatingFare')}
              </div>
            ) : repriceError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="font-semibold">
                  {repriceError.toLowerCase().includes('session expired') || repriceError.toLowerCase().includes('sign in')
                    ? tCheckout('signInToContinue')
                    : tCheckout('fareNoLongerAvailable')}
                </p>
                <p className="mt-0.5 text-xs text-red-600">{repriceError} {tCheckout('fareReturnHint')}</p>
                <button onClick={() => router.push('/flights/search')} className="mt-2 text-xs font-semibold text-red-700 underline">{tCheckout('backToSearch')}</button>
              </div>
            ) : priceChanged ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <p className="font-semibold">{tCheckout('priceUpdated')}</p>
                <p className="mt-0.5 text-xs text-amber-600">
                  {tCheckout('priceUpdatedDesc')}
                </p>
              </div>
            ) : freshRepriceAvailable ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {tCheckout('priceConfirmed')}
              </div>
            ) : null}

            {/* ── CTA ── */}
            <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.34 } })}>
              {isAgent ? (
                <Button onClick={handleAgentSubmit} loading={agentSubmitting} disabled={!!repriceError || repriceLoading || (agentPaymentMethod === 'wallet' && !walletSufficient && !!walletBalance)} size="lg" className="w-full">
                  <LockIcon className="h-4 w-4 mr-2" />
                  {agentPaymentMethod === 'wallet' ? tCheckout('confirmBookingWallet') : tCheckout('confirmBookingWithGateway', { gateway: agentGateway === 'STRIPE' ? tCheckout('gatewayCard') : agentGateway === 'PAYPAL' ? tCheckout('gatewayPayPal') : agentGateway === 'BANK_TRANSFER' ? tCheckout('gatewayBank') : tCheckout('gatewayPayLater') })}
                  {` — ${chargePrice ? formatPriceRaw(chargePrice.amount, chargePrice.currency) : formatPrice(promoFinalInSelected ?? grandTotal, selectedCurrency.code)}`}
                </Button>
              ) : (
                <Button onClick={handleCustomerCheckout} loading={checkoutMutation.isPending} disabled={!!repriceError || repriceLoading || (paymentMethod === 'wallet' && showCustomerWallet && !customerWalletSufficient)} size="lg" className="w-full">
                  <LockIcon className="h-4 w-4 mr-2" />
                  {paymentMethod === 'wallet' ? tCheckout('confirmBookingWallet') : tCheckout('confirmBooking')}{` — ${formatPrice(promoFinalInSelected ?? grandTotal, selectedCurrency.code)}`}
                </Button>
              )}
            </motion.div>

          </motion.div>
      </>
      )}
    </BookingLayout>
  );
}
