'use client';
import { useTranslations } from 'next-intl';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { getCancellationPolicyView } from '@/lib/utils/cancellation-policy';
import type { AggregatedPolicy } from '@/lib/schema/hotel';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useHotelCheckout } from '@/features/hotels/hooks';
import { validateRateApi } from '@/features/hotels/api/validate-rate';
import { getEnabledGateways } from '@/features/payments/api/get-gateway-config';
import type { GatewayListItem } from '@/features/payments/api/get-gateway-config';
import { getAgentAccess, isAllowed } from '@/features/agent/api/agent-access';
import { Button } from '@/components/ui/button';
import { BankTransferIcon, PayLaterIcon } from './payment-method-icons';
import { BankTransferDetails, PayLaterInfo } from '@/components/booking/bank-transfer-details';
import { PromoCodeInput } from '@/components/booking/promo-code-input';
import { CountrySelect } from '@/components/booking/country-select';
import { useCountries } from '@/features/reference/hooks';
import { isValidEmail, isValidName, isValidPhone, normalizePhoneParts } from '@/lib/utils/validation';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/context/CurrencyContext';
import { buildDisplayPrice, formatCurrency } from '@/lib/utils/currency';
import { refreshAuthToken } from '@/lib/api/client';
import { storeCheckoutData } from '@/lib/checkout-storage';

import { getWalletBalance } from '@/features/wallet/api/agent-wallet';
import type { WalletBalance } from '@/features/wallet/api/agent-wallet';
import { getCustomerWalletBalance } from '@/features/wallet/api/customer-wallet';
import type { CustomerWalletBalance } from '@/features/wallet/api/customer-wallet';
import { BookingLayout } from '@/components/booking/booking-layout';
import { clearFormDraft, getLastUrl, loadFormDraft, saveFormDraft, saveLastUrl } from '@/lib/utils/search-cache';
import { handleHotelImageError } from '@/lib/utils/hotel-image-fallback';
import { getGuestBookingStatus } from '@/features/admin/api/admin-settings';
import { HotelRateComments } from '@/features/hotels/components/hotel-rate-comments';
import { PriceBreakdownNote } from '@/components/shared/price-breakdown-note';

// ─── Types ──────────────────────────────────────────────────

interface HotelDetailsViewProps {
  rateId: string;
  rateKey?: string;
  hotelName?: string;
  roomName?: string;
  boardName?: string;
  price: number;
  currency: string;
  checkIn?: string;
  checkOut?: string;
  roomAdults: string;
  roomChildren: string;
  roomChildAges?: string;
  destination?: string;
  provider?: string;
  providerHotelId?: string;
  searchKey?: string;
  hotelId?: string;
  hotelImage?: string;
  starRating?: string;
  mode?: 'customer' | 'agent';
}

interface RoomDef { roomId: string; adults: number; children: number; }

interface GuestDraft { roomId: string; name: string; lastName: string; age: string; title: string; }

// ─── Constants ──────────────────────────────────────────────

const ease = [0.16, 1, 0.3, 1] as const;
const sectionAnim = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease } };
const CANCELLATION_POLICY = 'Free cancellation before check-in, subject to provider policy.';
const TITLES = ['Mr', 'Mrs', 'Miss'];

// ─── Input Styling ──────────────────────────────────────────

const inputBase = 'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all duration-150 placeholder:text-zinc-400';
const inputIdle = 'border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/10';
const inputClass = `${inputBase} ${inputIdle}`;
const selectChevron = `cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22%23999%22%20stroke-width%3D%221.5%22%3E%3Cpath%20d%3D%22m3%205%203%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9`;

function fieldStateClass(error?: string, valid?: boolean): string {
  if (error) return 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500/20';
  if (valid) return 'border-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20';
  return inputIdle;
}
const inputClassFor = (error?: string, valid?: boolean) => `${inputBase} ${fieldStateClass(error, valid)}`;
const selectClassFor = (error?: string, valid?: boolean) => `${inputBase} ${fieldStateClass(error, valid)} ${selectChevron}`;

// ─── Icons ──────────────────────────────────────────────────

function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);
}
function ShieldIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>);
}
function StarIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>);
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

function parseRooms(adultsStr: string, childrenStr: string): RoomDef[] {
  const adultsArr = adultsStr.split(',').map(Number);
  const childrenArr = childrenStr.split(',').map(Number);
  return Array.from({ length: Math.max(adultsArr.length, childrenArr.length) }, (_, i) => ({
    roomId: String(i + 1), adults: adultsArr[i] || 1, children: childrenArr[i] || 0,
  }));
}

function buildGuests(rooms: RoomDef[], childAges?: string): GuestDraft[] {
  const guests: GuestDraft[] = [];
  let agesByRoom: number[][] = [];
  try { agesByRoom = JSON.parse(childAges ?? '[]') ?? []; } catch { /* */ }
  for (const room of rooms) {
    const ages = agesByRoom[Number(room.roomId) - 1] ?? [];
    for (let i = 0; i < room.adults; i++) guests.push({ roomId: room.roomId, name: '', lastName: '', age: '', title: '' });
    for (let i = 0; i < room.children; i++) guests.push({ roomId: room.roomId, name: '', lastName: '', age: String(ages[i] ?? ''), title: '' });
  }
  return guests;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function nightCount(checkIn?: string, checkOut?: string): number {
  if (!checkIn || !checkOut) return 1;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

// ─── Payment Method Card ────────────────────────────────────

interface PaymentCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
}

function PaymentMethodCard({ selected, onClick, icon, title, subtitle, disabled }: PaymentCardProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease }}
      className={`relative flex flex-col items-center gap-2.5 rounded-lg border-2 p-4 text-center transition-all duration-150 ${
        disabled ? 'opacity-40 cursor-not-allowed border-zinc-100 bg-zinc-50' :
        selected
          ? 'border-zinc-900 bg-zinc-900/[0.02]'
          : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      {selected && !disabled ? (
        <motion.span initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </motion.span>
      ) : null}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${selected && !disabled ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
    </motion.button>
  );
}

// ─── Field Component ────────────────────────────────────────

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-field-error={error ? 'true' : undefined}>
      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
        {label}{required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
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

// ─── Main Component ─────────────────────────────────────────

export function HotelDetailsView(props: HotelDetailsViewProps) {
  const tBooking = useTranslations('Booking');
  const tCheckout = useTranslations('Checkout');
  const tHotels = useTranslations('Hotels');
  const tCommon = useTranslations('Common');
  const tAuth = useTranslations('Auth');
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, user, isAgent, isAdmin } = useAuth();
  const isCustomer = isAuthenticated && !isAgent && !isAdmin;
  const { selectedCurrency, convertAmount, formatPrice, formatPriceRaw } = useCurrency();
  const checkoutMutation = useHotelCheckout();
  const reducedMotion = useReducedMotion();
  const { data: countries = [] } = useCountries();

  // Guest booking setting
  const [guestBookingEnabled, setGuestBookingEnabled] = useState(true); // default: enabled
  useEffect(() => {
    getGuestBookingStatus()
      .then((res) => setGuestBookingEnabled(res.enabled))
      .catch(() => {}); // fail open — default is enabled
  }, []);

  const effectiveRateId = props.rateId ?? props.rateKey ?? '';
  const effectivePrice = props.price || 0;
  const nights = nightCount(props.checkIn, props.checkOut);

  const rooms = useMemo(() => parseRooms(props.roomAdults, props.roomChildren), [props.roomAdults, props.roomChildren]);
  const totalGuests = rooms.reduce((s, r) => s + r.adults + r.children, 0);

  // ── State ──────────────────────────────────────────────────

  // Booking mode
  const [bookingMode, setBookingMode] = useState<'guest' | 'login'>(isAuthenticated ? 'login' : 'guest');

  // Contact
  const [holderTitle, setHolderTitle] = useState('');
  const [holderName, setHolderName] = useState(user?.firstName ?? '');
  const [holderLastName, setHolderLastName] = useState(user?.lastName ?? '');
  const [holderEmail, setHolderEmail] = useState(user?.email ?? '');
  const [holderPhone, setHolderPhone] = useState('');
  const [holderCountryIso2, setHolderCountryIso2] = useState('');
  const [holderCountryCode, setHolderCountryCode] = useState('');
  const knownDialCodes = useMemo(() => countries.map((country) => country.dialCode), [countries]);

  // Booking for someone else
  const [bookingForOther, setBookingForOther] = useState(false);

  // Guests
  const [guests, setGuests] = useState<GuestDraft[]>(() => buildGuests(rooms, props.roomChildAges));

  // Sync lead guest with contact when logged in
  const isSynced = isAuthenticated && !bookingForOther;
  useEffect(() => {
    if (isSynced && guestMeta.length > 0) {
      setGuests((prev) => {
        const next = [...prev];
        next[0] = { ...next[0], name: holderName, lastName: holderLastName };
        return next;
      });
    }
  }, [holderName, holderLastName, isSynced]);

  const guestMeta = useMemo(() => {
    const meta: Array<{ roomLabel: string; isLead: boolean; isAdult: boolean; adultIndex: number; childIndex: number }> = [];
    for (const room of rooms) {
      const roomLabel = rooms.length > 1 ? `Room ${room.roomId}` : '';
      for (let i = 0; i < room.adults; i++) meta.push({ roomLabel, isLead: rooms.indexOf(room) === 0 && i === 0, isAdult: true, adultIndex: i, childIndex: 0 });
      for (let i = 0; i < room.children; i++) meta.push({ roomLabel, isLead: false, isAdult: false, adultIndex: 0, childIndex: i });
    }
    return meta;
  }, [rooms]);

  // Special requests
  const [specialRequests, setSpecialRequests] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountMinor: number; finalAmountMinor: number; currency: string } | null>(null);

  // Payment
  type CustomerMethod = 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later' | 'wallet';
  const [paymentMethod, setPaymentMethod] = useState<CustomerMethod>('stripe');
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);

  // Restore form draft once (survives checkout → back navigation).
  useEffect(() => {
    const draft = loadFormDraft<{
      title: string; name: string; lastName: string; email: string; phone: string;
      countryCode: string; countryIso2: string; guests?: GuestDraft[];
    }>('hotel-details');
    if (!draft) return;
    const raf = requestAnimationFrame(() => {
      if (draft.title) setHolderTitle(draft.title);
      if (draft.name) setHolderName(draft.name);
      if (draft.lastName) setHolderLastName(draft.lastName);
      if (draft.email) setHolderEmail(draft.email);
      if (draft.phone) setHolderPhone(draft.phone);
      if (draft.countryCode) setHolderCountryCode(draft.countryCode);
      if (draft.countryIso2) setHolderCountryIso2(draft.countryIso2);
      if (draft.guests?.length === guests.length) setGuests(draft.guests);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form draft on every change (small payload).
  useEffect(() => {
    saveFormDraft('hotel-details', {
      title: holderTitle, name: holderName, lastName: holderLastName, email: holderEmail,
      phone: holderPhone, countryCode: holderCountryCode, countryIso2: holderCountryIso2,
      guests,
    });
  }, [holderTitle, holderName, holderLastName, holderEmail, holderPhone, holderCountryCode, holderCountryIso2, guests]);

  // Remember this detail URL so checkout's back button can return here.
  useEffect(() => {
    saveLastUrl('hotel-details', window.location.pathname + window.location.search);
  }, []);

  const isEnabled = (key: string) => gateways.some((g) => g.enabled && g.gateway === key);
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

  // Price verification — track supplier and display amounts separately
  const [verifiedSupplier, setVerifiedSupplier] = useState<{ amount: number; currency: string } | null>(null);
  const [verifiedDisplay, setVerifiedDisplay] = useState<{ amount: number; currency: string } | null>(null);
  const [verifiedPolicies, setVerifiedPolicies] = useState<Array<{
    amount?: string | number;
    from?: string;
    to?: string;
    deadline?: string;
    policyType?: string;
    percentage?: string | number;
    numberOfNights?: number;
  }>>([]);
  const [aggregatedPolicy, setAggregatedPolicy] = useState<AggregatedPolicy | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [validatedMarkup, setValidatedMarkup] = useState<{ supplier: number | null; markup: number | null } | null>(null);

  useEffect(() => {
    if (!effectiveRateId) return;
    let cancelled = false;
    setVerifying(true);
    setValidateError(null);
    validateRateApi({
      rateId: effectiveRateId, provider: props.provider ?? 'hotelbeds', searchKey: props.searchKey,
      providerHotelId: props.providerHotelId, checkIn: props.checkIn, checkOut: props.checkOut,
      occupancy: rooms.map((r) => ({ adults: r.adults, children: r.children })),
      displayCurrency: selectedCurrency.code,
    }).then((data) => {
      if (cancelled) return;
      setVerifiedSupplier({
        amount: data.supplierAmount ?? effectivePrice,
        currency: data.supplierCurrency ?? props.currency,
      });
      setValidatedMarkup({
        supplier: (data as any).supplierAmountInDisplay ?? null,
        markup: (data as any).markupAmount ?? null,
      });
      setVerifiedDisplay({
        amount: data.displayAmount ?? data.supplierAmount ?? effectivePrice,
        currency: data.displayCurrency ?? data.supplierCurrency ?? selectedCurrency.code,
      });
      const collectedPolicies = (data.rooms ?? [])
        .flatMap((room) => (room.rates ?? []).flatMap((r) => r.cancellationPolicies ?? []))
        .filter((p) => p && (p.amount != null || p.percentage != null || p.numberOfNights != null));
      setVerifiedPolicies(collectedPolicies);
      setAggregatedPolicy(data.aggregatedPolicy ?? null);
      setVerifying(false);
    })
      .catch((err) => {
        if (!cancelled) {
          // Network-level failures (backend down, Cloudflare 5xx page without
          // CORS headers) surface as TypeError "Failed to fetch" — show an
          // actionable message instead of the raw browser error.
          const msg = err?.message ?? '';
          const networkish = /failed to fetch|networkerror|load failed/i.test(msg);
          setValidateError(
            networkish
              ? tCheckout('networkVerifyError')
              : (err?.message || tCheckout('priceNotVerifiedError')),
          );
          setVerifying(false);
        }
      });
    return () => { cancelled = true; };
  }, [effectiveRateId, props.searchKey, props.providerHotelId, props.provider, props.checkIn, props.checkOut, effectivePrice, rooms, selectedCurrency.code, retryNonce, tCheckout]);

  const isBackendVerified = verifiedSupplier !== null && verifiedDisplay !== null;
  // Agent mode: the CHARGE price is the marked-up agent price (verifiedDisplay),
  // not the net supplier price (verifiedSupplier). Customers are charged the net.
  const supplierPrice = isBackendVerified ? (isAgent ? verifiedDisplay! : verifiedSupplier!) : { amount: effectivePrice, currency: props.currency };
  const displayPriceInfo = isBackendVerified ? verifiedDisplay! : (() => {
    const built = buildDisplayPrice(effectivePrice, props.currency, selectedCurrency.code, convertAmount);
    return { amount: built.displayAmount, currency: built.displayCurrency };
  })();
  const priceInfo = isBackendVerified
    ? { displayAmount: displayPriceInfo.amount, displayCurrency: displayPriceInfo.currency, chargeAmount: displayPriceInfo.amount, chargeCurrency: displayPriceInfo.currency }
    : buildDisplayPrice(effectivePrice, props.currency, selectedCurrency.code, convertAmount);

  // Promo quote amounts arrive in the promo's own currency — normalize to the
  // display currency once so both verified/raw branches render correctly.
  const promoDiscountInDisplay = appliedPromo
    ? appliedPromo.currency === priceInfo.displayCurrency
      ? appliedPromo.discountMinor / 100
      : convertAmount(appliedPromo.discountMinor / 100, appliedPromo.currency)
    : 0;
  const promoFinalInDisplay = appliedPromo
    ? appliedPromo.currency === priceInfo.displayCurrency
      ? appliedPromo.finalAmountMinor / 100
      : convertAmount(appliedPromo.finalAmountMinor / 100, appliedPromo.currency)
    : null;

  const cancellationView = getCancellationPolicyView({
    cancellationPolicies: verifiedPolicies as import('@/lib/utils/cancellation-policy').CancellationPolicy[],
  });
  const policySummary = aggregatedPolicy?.displayText || cancellationView.description;

  // ── Validation ─────────────────────────────────────────────

  const [holderTouched, setHolderTouched] = useState<Record<string, boolean>>({});
  const [guestTouched, setGuestTouched] = useState<Record<string, Record<string, boolean>>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const markHolderTouched = useCallback((field: string) => {
    setHolderTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);
  const markGuestTouched = useCallback((index: number, field: string) => {
    setGuestTouched((prev) => {
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
    if (holderPhone.trim()) {
      const normalized = normalizePhoneParts(holderCountryCode, holderPhone, knownDialCodes);
      if (normalized.subscriberNumber) {
        const matchedCountry = countries.find((country) => country.dialCode.replace('+', '') === normalized.countryCode);
        if (matchedCountry) {
          setHolderCountryIso2(matchedCountry.code);
          setHolderCountryCode(matchedCountry.dialCode);
        }
        setHolderPhone(normalized.subscriberNumber);
      }
    }
    markHolderTouched('phone');
  }, [countries, holderCountryCode, holderPhone, knownDialCodes, markHolderTouched, setHolderCountryIso2, setHolderCountryCode, setHolderPhone]);

  const holderErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!holderTitle) e.title = tCheckout('holderTitleRequired');
    if (!isValidName(holderName)) e.firstName = tCheckout('holderFirstNameInvalid');
    if (!isValidName(holderLastName)) e.lastName = tCheckout('holderLastNameInvalid');
    if (!holderEmail.trim()) e.email = tCheckout('holderEmailRequired');
    else if (!isValidEmail(holderEmail)) e.email = tCheckout('holderEmailInvalid');
    if (!holderCountryCode) e.countryCode = tCheckout('holderCountryCodeRequired');
    if (!holderPhone.trim()) e.phone = tCheckout('holderPhoneRequired');
    else if (!isValidPhone(holderCountryCode, holderPhone, knownDialCodes)) e.phone = tCheckout('holderPhoneInvalid');
    return e;
  }, [holderTitle, holderName, holderLastName, holderEmail, holderCountryCode, holderPhone, knownDialCodes, tCheckout]);

  const guestErrors = useMemo(() => guests.map((g, index) => {
    const meta = guestMeta[index];
    const isLead = meta?.isLead;
    const isBlocked = isSynced && isLead;
    const effectiveTitle = isBlocked ? holderTitle : g.title;
    const e: Record<string, string> = {};
    if (!effectiveTitle) e.title = tCheckout('holderTitleRequired');
    if (!isValidName(g.name)) e.name = tCheckout('guestFirstNameInvalid');
    if (!isValidName(g.lastName)) e.lastName = tCheckout('guestLastNameInvalid');
    if (meta && !meta.isAdult) {
      const ageNum = Number(g.age);
      if (!g.age.trim() || !Number.isInteger(ageNum) || ageNum < 0 || ageNum > 17) e.age = tCheckout('guestAgeInvalid');
    }
    return e;
  }), [guests, guestMeta, isSynced, holderTitle, tCheckout]);

  const holderValid = Object.keys(holderErrors).length === 0;
  const guestsValid = guestErrors.every((e) => Object.keys(e).length === 0);
  const isFormValid = holderValid && guestsValid;
  const canProceed = (bookingMode === 'login' || (bookingMode === 'guest' && guestBookingEnabled)) && isFormValid && agreeTerms && !validateError;

  const holderField = useCallback((field: string) => ({
    error: (holderErrors[field] && (holderTouched[field] || attemptedSubmit)) ? holderErrors[field] : undefined,
    valid: !!holderTouched[field] && !holderErrors[field],
  }), [holderErrors, holderTouched, attemptedSubmit]);
  const guestField = useCallback((index: number, field: string) => ({
    error: (guestErrors[index]?.[field] && (guestTouched[index]?.[field] || attemptedSubmit)) ? guestErrors[index]?.[field] : undefined,
    valid: !!guestTouched[index]?.[field] && !guestErrors[index]?.[field],
  }), [guestErrors, guestTouched, attemptedSubmit]);

  // ── Agent state ────────────────────────────────────────────

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
  const displayPriceInWalletCurrency = convertAmount(supplierPrice.amount, supplierPrice.currency);
  // Wallet figures live in the wallet currency, the price in selected display
  // currency — convert the wallet side before comparing (previously raw).
  const walletCurrency = walletBalance?.currency ?? selectedCurrency.code;
  const walletTotal = walletBalance ? (walletBalance.walletBalance + walletBalance.creditAvailable) : 0;
  const walletTotalInSelected = walletCurrency === selectedCurrency.code ? walletTotal : convertAmount(walletTotal, walletCurrency);
  const walletSufficient = walletBalance ? walletTotalInSelected >= displayPriceInWalletCurrency : false;

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
  const customerChargeAmount = promoFinalInDisplay ?? priceInfo.displayAmount;
  const customerWalletCurrency = customerWallet?.currency ?? selectedCurrency.code;
  const customerWalletTotal = customerWallet ? customerWallet.walletBalance + (customerWallet.creditAvailable ?? 0) : 0;
  const customerWalletTotalInSelected = customerWalletCurrency === selectedCurrency.code ? customerWalletTotal : convertAmount(customerWalletTotal, customerWalletCurrency);
  const customerWalletSufficient = customerWallet ? customerWalletTotalInSelected >= customerChargeAmount : false;
  const showCustomerWallet = isCustomer && !!customerWallet && customerWallet.walletBalance > 0;

  // ── Handlers ───────────────────────────────────────────────

  const updateGuest = useCallback((index: number, field: keyof GuestDraft, value: string) => {
    setGuests((prev) => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });
  }, []);

  const buildPaxes = useCallback(() => guests.map((g) => ({
    roomId: g.roomId, type: (g.age && Number(g.age) > 0 ? 'CH' : 'AD') as 'AD' | 'CH', name: g.name, surname: g.lastName,
  })), [guests]);

  const handleCustomerCheckout = useCallback(async () => {
    if (!canProceed || !effectiveRateId) {
      setAttemptedSubmit(true);
      toast.error(tBooking('toastCompleteFields'));
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
    try {
      const res = await checkoutMutation.mutateAsync({
        rateKey: effectiveRateId, rateId: effectiveRateId, searchKey: props.searchKey,
        hotelId: props.hotelId, provider: props.provider, providerHotelId: props.providerHotelId,
        holder: { name: holderName, surname: holderLastName }, clientReference: holderEmail,
        paxes: buildPaxes(), gateway: paymentMethod === 'wallet' ? 'STRIPE' : toCheckoutGateway(paymentMethod),
        // ponytail: gateway DTO requires a value — 'STRIPE' placeholder, server takes wallet branch
        ...(paymentMethod === 'wallet' ? { paymentMethod: 'wallet' as const } : {}),
        currency: selectedCurrency.code,
        displayCurrency: selectedCurrency.code,
        checkIn: props.checkIn || undefined,
        checkOut: props.checkOut || undefined,
        hotelName: props.hotelName || undefined,
        roomName: props.roomName || undefined,
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
      });
      // Wallet bookings settle via reserve-commit — no gateway redirect.
      if (paymentMethod === 'wallet' && res.paymentMethod === 'wallet') {
        clearFormDraft('hotel-details');
        toast.success(tBooking('toastBookingSubmittedTitle'), tBooking('toastBookingSubmittedDesc'));
        router.push(`/booking/${res.bookingId}/success?type=hotel&mode=customer`);
        return;
      }
      // Manual methods (bank_transfer / pay_later): continue to the checkout
      // page — bank details + receipt upload + confirm happen there.
      if (res.paymentMethod === 'BANK_TRANSFER' || res.paymentMethod === 'PAY_LATER') {
        storeCheckoutData({
          paymentId: res.paymentId, bookingId: res.bookingId, bookingType: 'hotel',
          amount: res.amount, currency: res.currency,
          displayAmount: res.amount, displayCurrency: res.currency,
          clientSecret: null, checkoutUrl: null, hotelName: props.hotelName ?? null,
          roomName: props.roomName ?? null, paymentMethod, isAgent,
          aggregatedPolicy: aggregatedPolicy ?? undefined,
        });
        clearFormDraft('hotel-details');
        toast.success(tBooking('toastBookingHeldTitle'), tBooking('toastBookingHeldDesc'));
        router.push(`/checkout/${res.paymentId}${isAgent ? '?mode=agent' : ''}`);
        return;
      }
      storeCheckoutData({
        paymentId: res.paymentId, bookingId: res.bookingId, bookingType: 'hotel',
        amount: res.amount, currency: res.currency,
        displayAmount: res.amount, displayCurrency: res.currency,
        clientSecret: res.clientSecret ?? null,
        checkoutUrl: res.checkoutUrl ?? null, hotelName: props.hotelName ?? null,
        roomName: props.roomName ?? null, paymentMethod, isAgent,
        aggregatedPolicy: aggregatedPolicy ?? undefined,
      });
      clearFormDraft('hotel-details');
      toast.success(tBooking('toastCheckoutInitiatedTitle'), tBooking('toastCheckoutInitiatedDesc'));
      router.push(`/checkout/${res.paymentId}${isAgent ? '?mode=agent' : ''}`);
    } catch (err: unknown) {
      toast.error(tBooking('toastCheckoutFailedTitle'), err instanceof Error ? err.message : tBooking('toastTryAgainFallback'));
    }
  }, [canProceed, effectiveRateId, checkoutMutation, props, holderName, holderLastName, holderEmail, buildPaxes, paymentMethod, supplierPrice, isAgent, router, toast, appliedPromo, toCheckoutGateway, tBooking]);

  const handleAgentSubmit = useCallback(async () => {
    if (!canProceed || !effectiveRateId) { setAttemptedSubmit(true); return; }
    setAgentSubmitting(true);
    await refreshAuthToken();
    try {
      // Unified pipeline Phase 6: ONE shared checkout for all roles. The server
      // resolves the caller's role — agents take the wallet/credit reserve-commit
      // branch; no client-side price is sent (server preview() computes it).
      const res = await checkoutMutation.mutateAsync({
        rateKey: effectiveRateId, rateId: effectiveRateId, searchKey: props.searchKey,
        hotelId: props.hotelId, provider: props.provider, providerHotelId: props.providerHotelId,
        holder: { name: holderName, surname: holderLastName }, clientReference: holderEmail,
        paxes: buildPaxes(),
        gateway: agentPaymentMethod === 'card' ? agentGateway : 'STRIPE',
        // Wallet is the agent default (server wallet branch); 'gateway' forces
        // the PaymentIntent flow when the agent chooses card.
        ...(agentPaymentMethod === 'card' ? { paymentMethod: 'gateway' as const } : {}),
        currency: selectedCurrency.code, displayCurrency: selectedCurrency.code,
        checkIn: props.checkIn || undefined, checkOut: props.checkOut || undefined,
        hotelName: props.hotelName || undefined, roomName: props.roomName || undefined,
      });
      if ((res as any).paymentMethod === 'wallet') {
        toast.success(tBooking('toastBookingSubmittedTitle'), tBooking('toastBookingSubmittedDesc'));
        router.push(`/booking/${res.bookingId}/success?type=hotel&mode=agent`);
      } else if ((res as any).paymentMethod === 'BANK_TRANSFER' || (res as any).paymentMethod === 'PAY_LATER') {
        // Manual methods hold the booking — no gateway intent.
        storeCheckoutData({
          paymentId: res.paymentId, bookingId: res.bookingId, bookingType: 'hotel',
          amount: res.amount, currency: res.currency,
          displayAmount: priceInfo.displayAmount, displayCurrency: priceInfo.displayCurrency,
          clientSecret: null, checkoutUrl: null,
          hotelName: props.hotelName ?? null, roomName: props.roomName ?? null,
          paymentMethod: String((res as any).paymentMethod).toLowerCase() as 'bank_transfer' | 'pay_later', isAgent: true,
          aggregatedPolicy: aggregatedPolicy ?? undefined,
        });
        toast.success(tBooking('toastBookingHeldTitle'), tBooking('toastBookingHeldDesc'));
        router.push(`/checkout/${res.paymentId}?mode=agent`);
      } else {
        storeCheckoutData({
          paymentId: res.paymentId, bookingId: res.bookingId, bookingType: 'hotel',
          amount: res.amount, currency: res.currency,
          displayAmount: priceInfo.displayAmount, displayCurrency: priceInfo.displayCurrency,
          clientSecret: res.clientSecret ?? null, checkoutUrl: res.checkoutUrl ?? null,
          hotelName: props.hotelName ?? null, roomName: props.roomName ?? null,
          paymentMethod: agentGateway.toLowerCase() as 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later', isAgent: true,
          aggregatedPolicy: aggregatedPolicy ?? undefined,
        });
        toast.success(tBooking('toastCheckoutInitiatedTitle'), tBooking('toastCheckoutInitiatedDesc'));
        router.push(`/checkout/${res.paymentId}?mode=agent`);
      }
    } catch (err: unknown) {
      toast.error(tBooking('toastBookingFailedTitle'), err instanceof Error ? err.message : tBooking('toastTryAgainFallback'));
    } finally { setAgentSubmitting(false); }
  }, [canProceed, effectiveRateId, checkoutMutation, props, agentPaymentMethod, agentGateway, holderName, holderLastName, holderEmail, buildPaxes, selectedCurrency.code, priceInfo, aggregatedPolicy, router, toast, tBooking]);

  const ctaLoading = isAgent ? agentSubmitting : (checkoutMutation.isPending || verifying);
  const ctaDisabled = isAgent ? (!canProceed || verifying) : (!canProceed || verifying);

  // ── Sidebar ────────────────────────────────────────────────

  const sidebar = (
    <motion.div {...(reducedMotion ? {} : sectionAnim)} className="space-y-4">
      {/* Hotel Card */}
      <div className="border border-zinc-200 bg-white overflow-hidden">
        {/* Thumbnail */}
        {props.hotelImage ? (
          <div className="relative h-40 bg-zinc-100">
            <Image src={props.hotelImage} alt={props.hotelName ?? ''} fill sizes="384px" className="object-cover" onError={handleHotelImageError} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            {props.starRating ? (
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-zinc-800 backdrop-blur-sm">
                <StarIcon className="text-amber-400" />{props.starRating}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="px-4 py-3.5">
          <h3 className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">{props.hotelName ?? tHotels('hotelFallback')}</h3>
          {props.destination ? <p className="mt-1 text-xs text-zinc-500">{props.destination}</p> : null}
          <div className="mt-3 flex items-center gap-4 text-xs text-zinc-600">
            <span>{formatDate(props.checkIn)}</span>
            <span className="text-zinc-300">→</span>
            <span>{formatDate(props.checkOut)}</span>
            <span className="ml-auto font-medium text-zinc-700">{tHotels('nightCount', { count: nights })}</span>
          </div>
        </div>
      </div>

      {/* Room Details */}
      <div className="border border-zinc-200 bg-white p-4">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3">{tHotels('selectedRoom')}</h3>
        {props.roomName ? (
          <p className="text-sm font-semibold text-zinc-800">{props.roomName} × {rooms.length}</p>
        ) : null}
        {props.boardName ? <p className="text-xs text-zinc-500 mt-0.5">{props.boardName}</p> : null}
        <div className="mt-3 space-y-2 text-xs text-zinc-600">
          <div className="flex justify-between"><span>{tHotels('pricePerNight')}</span><span className="font-medium text-zinc-800">{isBackendVerified ? formatPriceRaw(priceInfo.displayAmount / nights, priceInfo.displayCurrency) : formatPrice(priceInfo.displayAmount / nights, priceInfo.displayCurrency)}</span></div>
          <div className="flex justify-between"><span>{tHotels('nightsLabel')}</span><span className="font-medium text-zinc-800">{nights}</span></div>
          <div className="flex justify-between"><span>{tHotels('roomsLabel')}</span><span className="font-medium text-zinc-800">{rooms.length}</span></div>
        </div>
        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {props.boardName?.toLowerCase().includes('breakfast') ? <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/50">{tHotels('breakfastIncluded')}</span> : null}
          {cancellationView.isFree ? (
            <span className="inline-flex items-center rounded-md bg-brand-teal/10 px-2 py-0.5 text-[10px] font-semibold text-brand-teal ring-1 ring-brand-teal/20">{tHotels('freeCancellation')}</span>
          ) : cancellationView.isNonRefundable ? (
            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200/60">{tHotels('nonRefundable')}</span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/50">{tHotels('cancellationFee')}</span>
          )}
        </div>
        {/* Validation error banner */}
        {validateError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] font-medium text-red-700">
            {validateError}
            <button
              type="button"
              onClick={() => {
                setValidateError(null);
                setRetryNonce((n) => n + 1);
              }}
              className="ml-2 underline text-red-800"
            >
              {tCommon('retry')}
            </button>
          </div>
        ) : null}
        {verifying ? (
          <div className="mt-3 text-center text-xs text-zinc-400 py-2">{tHotels('verifyingPrice')}</div>
        ) : null}
        {/* Price Totals */}
        <div className="mt-4 border-t border-zinc-100 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-zinc-600">{tHotels('roomsTotal')}</span><span className="font-medium text-zinc-800">{isBackendVerified ? formatPriceRaw(priceInfo.displayAmount, priceInfo.displayCurrency) : formatPrice(priceInfo.displayAmount, priceInfo.displayCurrency)}</span></div>
          {appliedPromo ? (
            <div className="flex justify-between"><span className="text-emerald-600">{tHotels('promoDiscount', { code: appliedPromo.code })}</span><span className="font-medium text-emerald-600">-{isBackendVerified ? formatPriceRaw(promoDiscountInDisplay, priceInfo.displayCurrency) : formatPrice(promoDiscountInDisplay, priceInfo.displayCurrency)}</span></div>
          ) : null}
          <div className="flex justify-between"><span className="text-zinc-600">{tHotels('taxesFees')}</span><span className="font-medium text-zinc-800">{tHotels('included')}</span></div>
          <div className="flex justify-between border-t border-zinc-100 pt-2 mt-2"><span className="font-bold text-zinc-900">{tHotels('total')}</span><span className="font-bold text-zinc-900 text-base">{isBackendVerified ? formatPriceRaw(promoFinalInDisplay ?? priceInfo.displayAmount, priceInfo.displayCurrency) : formatPrice(promoFinalInDisplay ?? priceInfo.displayAmount, priceInfo.displayCurrency)}</span></div>
          <div className="mt-2">
            <PriceBreakdownNote
              supplierAmount={validatedMarkup?.supplier}
              markupAmount={validatedMarkup?.markup}
              total={displayPriceInfo.amount}
              currency={displayPriceInfo.currency}
              label={tHotels('markupAdmin')}
            />
          </div>
        </div>
      </div>

      {/* Promo Code */}
      <div className="border border-zinc-200 bg-white p-4">
        <PromoCodeInput
          productType="hotels"
          context={{ hotelId: props.hotelId, destinationCode: props.destination, providerKey: props.provider }}
          onPromoApplied={setAppliedPromo}
          onPromoRemoved={() => setAppliedPromo(null)}
        />
      </div>

      {/* Rate Comments — Cancellation Policy */}
      <HotelRateComments
        data={{
          provider: props.provider,
          boardName: props.boardName,
          roomName: props.roomName,
          refundable: aggregatedPolicy?.refundable,
          cancellationPolicies: verifiedPolicies.length > 0 ? verifiedPolicies : undefined,
          modificationAllowed: true,
          aggregatedPolicy: aggregatedPolicy ?? undefined,
        }}
      />

      {/* Trust Badges */}
      <div className="border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-zinc-600"><ShieldIcon className="h-3.5 w-3.5 text-zinc-400" /> {tHotels('confirmationEmail')}</div>
        <div className="flex items-center gap-2 text-xs text-zinc-600"><LockIcon className="h-3.5 w-3.5 text-zinc-400" /> {tHotels('paymentSecure')}</div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <svg className="h-3.5 w-3.5 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
          {tHotels('noHiddenCharges')}
        </div>
      </div>
    </motion.div>
  );

  // ── Main Render ────────────────────────────────────────────

  const backToSearch = getLastUrl('hotels-search') ?? '/hotels/search';

  return (
    <BookingLayout title={props.hotelName ?? tHotels('hotelDetailsFallback')} backHref={backToSearch} backLabel={tCheckout('backToSearch')} sidebar={sidebar}>
      <motion.div {...(reducedMotion ? {} : sectionAnim)} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{tCheckout('completeBookingTitle')}</h1>
        <div className="mt-2 flex items-center gap-2">
          <p className="text-sm text-zinc-500">{tCheckout('fillDetailsDesc', { hotelName: props.hotelName ?? '' })}</p>
          {!isAuthenticated && guestBookingEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              {tBooking('guestBookingBadge')}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Guest booking disabled + not authenticated → require sign-in ── */}
      {!isAuthenticated && !guestBookingEnabled ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">{tAuth('signInRequiredTitle')}</h2>
              <p className="text-sm text-zinc-500">{tAuth('signInRequiredDesc')}</p>
              <div className="flex justify-center gap-3">
                <a href={`/signin?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`}>
                  <Button size="sm">{tAuth('signInButton')}</Button>
                </a>
                <a href="/signup">
                  <Button variant="secondary" size="sm">{tAuth('createAccountButton')}</Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* ── Booking Mode Selector ── */}
      {!isAgent ? (
        <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.05 } })} className="mb-7">
          <SectionHeading>{tBooking('bookingAs')}</SectionHeading>
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              type="button" onClick={() => setBookingMode('guest')}
              whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease }}
              className={`relative flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-all duration-150 ${
                bookingMode === 'guest' ? 'border-zinc-900 bg-zinc-900/[0.02]' : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              {bookingMode === 'guest' ? (
                <motion.span initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </motion.span>
              ) : null}
              <span className="text-sm font-semibold text-zinc-900">{tBooking('guestBookingMode')}</span>
              <span className="text-xs text-zinc-500">{tBooking('bookWithoutAccount')}</span>
            </motion.button>
            <motion.button
              type="button" onClick={() => setBookingMode('login')}
              whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease }}
              className={`relative flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-all duration-150 ${
                bookingMode === 'login' ? 'border-zinc-900 bg-zinc-900/[0.02]' : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              {bookingMode === 'login' ? (
                <motion.span initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </motion.span>
              ) : null}
              <span className="text-sm font-semibold text-zinc-900">{tBooking('loginToBook')}</span>
              <span className="text-xs text-zinc-500">{tBooking('loginFaster')}</span>
            </motion.button>
          </div>
        </motion.section>
      ) : null}

      {/* ── Guest Coming Soon (only when guest booking is disabled) ── */}
      <AnimatePresence mode="wait">
        {bookingMode === 'guest' && !isAgent && !guestBookingEnabled ? (
          <motion.section key="guest-coming-soon" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? {} : { opacity: 0, y: -12 }} transition={{ duration: 0.3, ease }} className="mb-7">
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-4">
                <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-amber-900">{tBooking('guestComingSoonTitle')}</h3>
              <p className="mt-2 text-sm text-amber-700 max-w-sm mx-auto">{tBooking('guestComingSoonDesc')}</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button onClick={() => setBookingMode('login')} size="sm">{tBooking('switchToLogin')}</Button>
                <button onClick={() => router.push('/signin')} className="text-sm font-medium text-brand-teal hover:underline transition">{tBooking('signInToAccount')}</button>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* ── Form Sections ── */}
      <AnimatePresence mode="wait">
        {(bookingMode === 'login' || isAgent || (bookingMode === 'guest' && guestBookingEnabled)) ? (
          <motion.div key="booking-form" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? {} : { opacity: 0, y: -12 }} transition={{ duration: 0.3, ease }}>
            
            {/* ── Contact Details ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.08 } })} className="mb-7">
              <SectionHeading>{tCheckout('guestDetails')}</SectionHeading>
              <div className="rounded-lg border border-zinc-200 bg-white p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={tCheckout('formTitle')} required error={holderField('title').error}>
                    <select value={holderTitle} onChange={(e) => setHolderTitle(e.target.value)} onBlur={() => markHolderTouched('title')} className={selectClassFor(holderField('title').error, holderField('title').valid)}>
                      <option value="">{tCommon('select')}</option>
                      {TITLES.map((title) => <option key={title} value={title}>{title === 'Mr' ? tCheckout('titleMr') : title === 'Mrs' ? tCheckout('titleMrs') : tCheckout('titleMiss')}</option>)}
                    </select>
                  </Field>
                  <Field label={tCheckout('formFirstName')} required error={holderField('firstName').error}>
                    <input type="text" value={holderName} onChange={(e) => setHolderName(e.target.value)} onBlur={() => markHolderTouched('firstName')} placeholder={tCheckout('firstNamePlaceholder')} className={inputClassFor(holderField('firstName').error, holderField('firstName').valid)} />
                  </Field>
                  <Field label={tCheckout('formLastName')} required error={holderField('lastName').error}>
                    <input type="text" value={holderLastName} onChange={(e) => setHolderLastName(e.target.value)} onBlur={() => markHolderTouched('lastName')} placeholder={tCheckout('lastNamePlaceholder')} className={inputClassFor(holderField('lastName').error, holderField('lastName').valid)} />
                  </Field>
                  <Field label={tCheckout('formEmail')} required error={holderField('email').error}>
                    <input type="email" value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} onBlur={() => markHolderTouched('email')} placeholder={tCheckout('emailPlaceholder')} className={inputClassFor(holderField('email').error, holderField('email').valid)} />
                  </Field>
                  <Field label={tCheckout('formCountryCode')} required>
                    <CountrySelect value={holderCountryIso2} onChange={(code, country) => { setHolderCountryIso2(code); if (country) setHolderCountryCode(country.dialCode); markHolderTouched('countryCode'); }} countries={countries} mode="dial" error={holderField('countryCode').error} valid={holderField('countryCode').valid} aria-label={tCheckout('countryCodeAriaLabel')} />
                  </Field>
                  <Field label={tCheckout('formPhone')} required error={holderField('phone').error}>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={holderPhone}
                      onChange={(e) => setHolderPhone(e.target.value)}
                      onBlur={handlePhoneBlur}
                      placeholder={tCheckout('phonePlaceholder')}
                      className={inputClassFor(holderField('phone').error, holderField('phone').valid)}
                    />
                  </Field>
                </div>

                {/* Booking for someone else */}
                {isAuthenticated ? (
                  <label className="mt-4 flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      <input type="checkbox" checked={bookingForOther} onChange={(e) => setBookingForOther(e.target.checked)} className="peer sr-only" />
                      <div className="absolute inset-0 rounded border border-zinc-300 bg-white transition-colors duration-150 peer-checked:border-brand-teal peer-checked:bg-brand-teal" />
                      <svg className="relative h-2.5 w-2.5 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">{tCheckout('bookingForOther')}</span>
                      <p className="text-xs text-zinc-500 mt-0.5">{tCheckout('bookingForOtherDesc')}</p>
                    </div>
                  </label>
                ) : null}
              </div>
            </motion.section>

            {/* ── Room Guests ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.12 } })} className="mb-7">
              <SectionHeading>{tCheckout('guestInformation')}</SectionHeading>
              {guests.map((guest, index) => {
                const meta = guestMeta[index];
                const isLead = meta.isLead;
                const isBlocked = isSynced && isLead;
                return (
                  <div key={`${meta.roomLabel}-${index}`} className="mb-3 last:mb-0">
                    {/* Room label divider */}
                    {meta.isLead && meta.roomLabel ? (
                      <div className="mb-3 flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{tCheckout('roomLabel', { id: meta.roomLabel.split(' ')[1] ?? '' })}</span>
                        <div className="flex-1 h-px bg-zinc-100" />
                        <span className="text-[10px] font-medium text-zinc-400">{tCheckout('adultsCount', { count: rooms[Number(meta.roomLabel?.split(' ')[1] ?? '1') - 1]?.adults ?? 0 })}</span>
                      </div>
                    ) : null}
                    <div className={`rounded-lg border bg-white p-4 transition-all duration-150 ${isBlocked ? 'border-zinc-100 bg-zinc-50/50' : 'border-zinc-200'}`}>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-700">{meta.isAdult ? tCheckout('adultLabel', { index: meta.adultIndex + 1 }) : tCheckout('childLabel', { index: meta.childIndex + 1 })}</span>
                          {isLead ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/60">{tCheckout('leadTraveler')}</span> : null}
                        </div>
                        {isBlocked ? (
                          <span className="text-[10px] text-zinc-400 italic">{tCheckout('syncedWithDetails')}</span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={tCheckout('formTitle')} required error={guestField(index, 'title').error}>
                          <select value={isBlocked ? holderTitle : guest.title} onChange={(e) => updateGuest(index, 'title', e.target.value)} onBlur={() => !isBlocked && markGuestTouched(index, 'title')} disabled={isBlocked} className={`${selectClassFor(guestField(index, 'title').error, guestField(index, 'title').valid)} ${isBlocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
                            <option value="">{tCommon('select')}</option>
                            {TITLES.map((title) => <option key={title} value={title}>{title === 'Mr' ? tCheckout('titleMr') : title === 'Mrs' ? tCheckout('titleMrs') : tCheckout('titleMiss')}</option>)}
                          </select>
                        </Field>
                        <Field label={isBlocked ? tCheckout('firstNameSynced') : tCheckout('formFirstName')} required error={guestField(index, 'name').error}>
                          <input type="text" value={isBlocked ? holderName : guest.name} onChange={(e) => isBlocked ? setHolderName(e.target.value) : updateGuest(index, 'name', e.target.value)} onBlur={() => !isBlocked && markGuestTouched(index, 'name')} placeholder={tCheckout('firstNamePlaceholder')} className={`${isBlocked ? inputClass : inputClassFor(guestField(index, 'name').error, guestField(index, 'name').valid)} ${isBlocked ? 'bg-zinc-50 text-zinc-500 cursor-not-allowed' : ''}`} disabled={isBlocked} />
                        </Field>
                        <Field label={isBlocked ? tCheckout('lastNameSynced') : tCheckout('formLastName')} required error={guestField(index, 'lastName').error}>
                          <input type="text" value={isBlocked ? holderLastName : guest.lastName} onChange={(e) => isBlocked ? setHolderLastName(e.target.value) : updateGuest(index, 'lastName', e.target.value)} onBlur={() => !isBlocked && markGuestTouched(index, 'lastName')} placeholder={tCheckout('lastNamePlaceholder')} className={`${isBlocked ? inputClass : inputClassFor(guestField(index, 'lastName').error, guestField(index, 'lastName').valid)} ${isBlocked ? 'bg-zinc-50 text-zinc-500 cursor-not-allowed' : ''}`} disabled={isBlocked} />
                        </Field>
                        {!meta.isAdult ? (
                          <Field label={tCheckout('ageLabel')} required error={guestField(index, 'age').error}>
                            <input type="number" value={guest.age} onChange={(e) => updateGuest(index, 'age', e.target.value)} onBlur={() => markGuestTouched(index, 'age')} placeholder={tCheckout('agePlaceholder')} className={inputClassFor(guestField(index, 'age').error, guestField(index, 'age').valid)} min={0} max={17} />
                          </Field>
                        ) : <div />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.section>

            {/* ── Payment Methods ── */}
            {!isAgent ? (
              <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.16 } })} className="mb-7">
                <SectionHeading>{tCheckout('paymentMethod')}</SectionHeading>
                {showCustomerWallet && customerWallet ? (
                  <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{tCheckout('walletBalance', { currency: customerWalletCurrency })}</span>
                      <span className="font-semibold text-zinc-900">{formatPrice(customerWallet.walletBalance, customerWalletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                      <span className="font-medium text-zinc-600">{tCheckout('totalAvailable', { currency: customerWalletCurrency })}</span>
                      <span className={`font-bold ${customerWalletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(customerWalletTotal, customerWalletCurrency)}</span>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <PaymentMethodCard selected={paymentMethod === 'stripe' && stripeAvailable} onClick={() => setPaymentMethod('stripe')} icon={<CardIcon />} title={tCheckout('creditCard')} subtitle={tCheckout('poweredByStripe')} disabled={!stripeAvailable} />
                  <PaymentMethodCard selected={paymentMethod === 'paypal' && paypalAvailable} onClick={() => setPaymentMethod('paypal')} icon={<PayPalIcon />} title={tCheckout('digitalWallet')} subtitle={tCheckout('payWithPayPal')} disabled={!paypalAvailable} />
                  <PaymentMethodCard selected={paymentMethod === 'pay_later' && payLaterAvailable} onClick={() => setPaymentMethod('pay_later')} icon={<PayLaterIcon />} title={tCheckout('payLater')} subtitle={payLaterAvailable ? tCheckout('payLaterDesc') : tCommon('disabled')} disabled={!payLaterAvailable} />
                  <PaymentMethodCard selected={paymentMethod === 'bank_transfer' && bankTransferAvailable} onClick={() => setPaymentMethod('bank_transfer')} icon={<BankTransferIcon />} title={tCheckout('bankTransfer')} subtitle={bankTransferAvailable ? tCheckout('bankTransferDesc') : tCommon('disabled')} disabled={!bankTransferAvailable} />
                  {showCustomerWallet ? (
                    <PaymentMethodCard selected={paymentMethod === 'wallet'} onClick={() => setPaymentMethod('wallet')} icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>} title={tCheckout('wallet')} subtitle={tCheckout('walletBalanceSubtitle', { balance: formatPrice(customerWalletTotal, customerWalletCurrency) })} />
                  ) : null}
                </div>
                {paymentMethod === 'wallet' && showCustomerWallet && !customerWalletSufficient ? (
                  <p className="mt-2 text-xs font-medium text-red-600">{tCheckout('insufficientCustomerWallet')}</p>
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
              <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.16 } })} className="mb-7">
                <SectionHeading>{tCheckout('agentPaymentMethod')}</SectionHeading>
                {walletBalance ? (
                  <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{tCheckout('walletBalance', { currency: walletCurrency })}</span>
                      <span className="font-semibold text-zinc-900">{formatPrice(walletBalance.walletBalance, walletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{tCheckout('creditAvailable', { currency: walletCurrency })}</span>
                      <span className={`font-semibold ${walletBalance.creditAvailable > 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>{formatPrice(walletBalance.creditAvailable, walletCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-xs">
                      <span className="font-medium text-zinc-600">{tCheckout('totalAvailable', { currency: walletCurrency })}</span>
                      <span className={`font-bold ${walletSufficient ? 'text-emerald-600' : 'text-red-500'}`}>{formatPrice(walletBalance.walletBalance + walletBalance.creditAvailable, walletCurrency)}</span>
                    </div>
                  </div>
                ) : null}
                {agentPaymentMethod === 'wallet' && !walletSufficient && walletBalance ? (
                  <p className="mb-3 text-xs font-medium text-red-600">{tCheckout('insufficientAgentWallet')}</p>
                ) : null}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <PaymentMethodCard selected={agentPaymentMethod === 'wallet'} onClick={() => setAgentPaymentMethod('wallet')} disabled={!walletSufficient && !!walletBalance} icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>} title={tCheckout('wallet')} subtitle={tCheckout('payFromBalance')} />
                  <PaymentMethodCard selected={agentPaymentMethod === 'card'} onClick={() => setAgentPaymentMethod('card')} icon={<CardIcon />} title={tCheckout('cardTitle')} subtitle={tCheckout('payViaCard')} />
                </div>
                {agentPaymentMethod === 'card' && (
                  <div className="grid grid-cols-2 gap-3">
                    <PaymentMethodCard selected={agentGateway === 'STRIPE'} onClick={() => setAgentGateway('STRIPE')} icon={<CardIcon />} title={tCheckout('creditCard')} subtitle={agentGatewayAllowed('stripe') ? tCheckout('poweredByStripe') : tCommon('disabled')} disabled={!agentGatewayAllowed('stripe')} />
                    <PaymentMethodCard selected={agentGateway === 'PAYPAL'} onClick={() => setAgentGateway('PAYPAL')} icon={<PayPalIcon />} title={tCheckout('digitalWallet')} subtitle={agentGatewayAllowed('paypal') ? tCheckout('payWithPayPal') : tCommon('disabled')} disabled={!agentGatewayAllowed('paypal')} />
                    <PaymentMethodCard selected={agentGateway === 'BANK_TRANSFER'} onClick={() => setAgentGateway('BANK_TRANSFER')} icon={<BankTransferIcon />} title={tCheckout('bankTransfer')} subtitle={bankTransferAvailable && agentGatewayAllowed('bank_transfer') ? tCheckout('bankTransferDesc') : tCommon('disabled')} disabled={!bankTransferAvailable || !agentGatewayAllowed('bank_transfer')} />
                    <PaymentMethodCard selected={agentGateway === 'PAY_LATER'} onClick={() => setAgentGateway('PAY_LATER')} icon={<PayLaterIcon />} title={tCheckout('payLater')} subtitle={payLaterAvailable && agentGatewayAllowed('pay_later') ? tCheckout('payLaterDesc') : tCommon('disabled')} disabled={!payLaterAvailable || !agentGatewayAllowed('pay_later')} />
                  </div>
                )}
              </motion.section>
            ) : null}

            {/* ── Special Requests ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.2 } })} className="mb-7">
              <SectionHeading>{tCheckout('specialRequests')}</SectionHeading>
              <div className="relative">
                <textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder={tCheckout('specialRequestsPlaceholder')} rows={3} className={`${inputBase} ${inputIdle} resize-none`} />
                <span className="absolute right-3 top-3 text-zinc-300 pointer-events-none"><EditIcon /></span>
              </div>
            </motion.section>

            {/* ── Terms ── */}
            <motion.section {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.24 } })} className="mb-7">
              <label
                className="flex items-start gap-3 cursor-pointer group"
                onClick={(e) => {
                  // Deterministic toggle: the default label→input click
                  // forwarding is flaky when the animated section re-renders
                  // between mousedown and click (the toggle silently died in
                  // live QA). Handle the state change ourselves instead.
                  e.preventDefault();
                  const t = e.target as HTMLElement;
                  if (t instanceof HTMLInputElement) return; // native activation already fired onChange
                  setAgreeTerms((v) => !v);
                }}
              >
                <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="peer sr-only" />
                  <div className="absolute inset-0 rounded border border-zinc-300 bg-white transition-colors duration-150 peer-checked:border-brand-teal peer-checked:bg-brand-teal" />
                  <svg className="relative h-2.5 w-2.5 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div>
                  <span className="text-sm text-zinc-700 group-hover:text-zinc-900 transition-colors">{tCheckout('acceptTerms')}</span>
                </div>
              </label>
              {attemptedSubmit && !agreeTerms ? (
                <p className="mt-2 text-xs font-medium text-red-600">{tCheckout('acceptTermsRequiredMsg')}</p>
              ) : null}
            </motion.section>

            {/* ── CTA ── */}
            <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.28 } })}>
              {isAgent ? (
                <Button onClick={handleAgentSubmit} loading={agentSubmitting} disabled={verifying || !!validateError || (agentPaymentMethod === 'wallet' && !walletSufficient && !!walletBalance)} size="lg" className="w-full">
                  <LockIcon className="h-4 w-4 mr-2" />
                  {agentPaymentMethod === 'wallet' ? tCheckout('confirmWithWallet') : tCheckout('confirmWithMethod', { method: agentGateway === 'STRIPE' ? tCheckout('cardMethodName') : agentGateway === 'PAYPAL' ? tCheckout('paypalMethodName') : agentGateway === 'BANK_TRANSFER' ? tCheckout('bankTransferMethodName') : tCheckout('payLaterMethodName') })} — {formatPrice(promoFinalInDisplay ?? priceInfo.displayAmount, priceInfo.displayCurrency)}
                </Button>
              ) : (
                <Button onClick={handleCustomerCheckout} loading={checkoutMutation.isPending || verifying} disabled={verifying || !!validateError || (paymentMethod === 'wallet' && showCustomerWallet && !customerWalletSufficient)} size="lg" className="w-full">
                  <LockIcon className="h-4 w-4 mr-2" />
                  {paymentMethod === 'wallet' ? tCheckout('confirmWithWallet') : tCheckout('confirmBooking')} — {formatPrice(promoFinalInDisplay ?? priceInfo.displayAmount, priceInfo.displayCurrency)}
                </Button>
              )}
            </motion.div>

          </motion.div>
        ) : null}
      </AnimatePresence>
      </>
      )}
    </BookingLayout>
  );
}
