'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useMemo, useState, useCallback, useRef, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { BookingLayout } from '@/components/booking/booking-layout';
import { StripePaymentForm } from '@/components/payment/stripe-payment-form';
import { PayPalPaymentButton } from '@/components/payment/paypal-payment-button';
import { confirmPayment } from '@/features/payments/api/confirm-payment';
import { useCurrency } from '@/context/CurrencyContext';
import { useToast } from '@/hooks/useToast';
import { clearFlowState } from '@/features/hotels/utils/checkout-flow-state';
import { getLastUrl } from '@/lib/utils/search-cache';
import { apiRequest } from '@/lib/api/client';
import { FlightRateComments, duffelRateComments } from '@/features/flights/components/flight-rate-comments';
import { BankTransferDetails } from '@/components/booking/bank-transfer-details';
import { uploadFlightReceipt, uploadHotelReceipt } from '@/features/bookings/api/customer-bookings';

const ease = [0.16, 1, 0.3, 1] as const;

// ─── Types ──────────────────────────────────────────────────

interface CheckoutData {
  paymentId: string; bookingId: string; bookingType?: string;
  amount: number; currency: string;
  displayAmount?: number; displayCurrency?: string;
  clientSecret: string | null; checkoutUrl: string | null;
  hotelName: string | null; roomName: string | null;
  paymentMethod?: 'stripe' | 'paypal' | 'wallet' | 'bank_transfer' | 'pay_later'; isAgent?: boolean;
  aggregatedPolicy?: import('@/lib/schema/hotel').AggregatedPolicy;
}

const FALLBACK: CheckoutData = { paymentId: '', bookingId: '', amount: 0, currency: 'USD', clientSecret: null, checkoutUrl: null, hotelName: null, roomName: null };

function readCheckoutData(paymentId: string): CheckoutData {
  try { const raw = sessionStorage.getItem('checkout_data'); if (raw) { const p = JSON.parse(raw) as CheckoutData; if (p.paymentId === paymentId) return p; } } catch { /* */ }
  return FALLBACK;
}

type PaymentTab = 'card' | 'paypal';

// ─── Icons ──────────────────────────────────────────────────

function LockPulse() {
  const [pulse, setPulse] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => setPulse(p => !p), 3000);
    return () => clearInterval(id);
  }, [reducedMotion]);
  return (
    <div className="relative flex items-center justify-center">
      <motion.div animate={reducedMotion ? {} : { scale: pulse ? [1, 1.15, 1] : 1, opacity: pulse ? [0.4, 0, 0.4] : 0.4 }} transition={{ duration: 2, ease }} className={`absolute inset-0 rounded-full bg-brand-teal/15`} />
      <svg className="relative h-5 w-5 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
    </div>
  );
}

function CheckIcon({ className = 'h-6 w-6' }: { className?: string }) { return (<svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>); }
function VisaLogo() { return (<svg className="h-6 w-8" viewBox="0 0 48 16" fill="none"><rect width="48" height="16" rx="2" fill="#1A1F71"/><path d="M18.5 4.5l-2.5 7h-1.7l-1.2-5.6c-.1-.4-.2-.6-.6-.8-.6-.3-1.3-.6-2-.8l.1-.5h3.4c.4 0 .8.3.9.7l.8 4.2 2-4.9h1.8zm6 4.7c0-1.8-2.5-2-2.5-2.8 0-.3.2-.5.8-.6h2l.4-1.8c-.5-.2-1.2-.4-2-.4-2.1 0-3.6 1.1-3.6 2.6 0 1.1 1.1 1.7 1.9 2.1.8.4 1.1.7 1.1 1s-.5.8-1.3.8h-2.2l-.4 1.8h2.5c2 0 3.3-1 3.3-2.5zm4.8 2.3h1.6l-1-7h-1.5c-.4 0-.7.2-.8.6l-2.3 6.4h1.6l.3-1h2l.1 1zm-1.7-2.4l.8-2.2.5 2.2h-1.3zm-6.5-4.6l-1.3 7h-1.6l1.3-7h1.6z" fill="#fff"/></svg>); }
function McLogo() { return (<svg className="h-6 w-8" viewBox="0 0 48 16" fill="none"><rect width="48" height="16" rx="2" fill="#fff"/><circle cx="16" cy="8" r="5" fill="#EB001B"/><circle cx="30" cy="8" r="5" fill="#F79E1B" fillOpacity="0.8"/></svg>); }
function AmexLogo() { return (<svg className="h-6 w-8" viewBox="0 0 48 16" fill="none"><rect width="48" height="16" rx="2" fill="#016FD0"/><text x="6" y="12" fill="#fff" fontSize="9" fontWeight="700" fontFamily="sans-serif">AMEX</text></svg>); }

// ─── Skeleton ───────────────────────────────────────────────

function Skele({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-zinc-200/60 ${className}`} />; }

function LoadingState() { return (
  <div className="space-y-6">
    <Skele className="h-8 w-48" /><Skele className="h-4 w-72" />
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 space-y-5">
      <Skele className="h-5 w-32" />
      <div className="grid grid-cols-2 gap-3"><Skele className="h-16 w-full rounded-xl" /><Skele className="h-16 w-full rounded-xl" /></div>
      <Skele className="h-52 w-full rounded-xl" />
    </div>
  </div>
);}

function SidebarSkele() { return (
  <div className="space-y-4">
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 space-y-4"><Skele className="h-4 w-20" /><Skele className="h-6 w-full" /><Skele className="h-3 w-32" /><div className="border-t border-zinc-100 pt-4 space-y-2"><Skele className="h-4 w-full" /><Skele className="h-6 w-24" /></div></div>
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 space-y-3"><Skele className="h-3 w-full" /><Skele className="h-3 w-3/4" /></div>
  </div>
);}

// ─── Main Component ─────────────────────────────────────────

export default function PaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const t = useTranslations('Checkout');
  const [paymentId, setPaymentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; kind: 'image' | 'pdf'; name: string } | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [confirmingManual, setConfirmingManual] = useState(false);
  const [userTab, setUserTab] = useState<PaymentTab | null>(null);
  const [ready, setReady] = useState(false);
  const toast = useToast(); const router = useRouter(); const { formatPrice, formatPriceRaw } = useCurrency();
  const searchParams = useSearchParams(); const mode = searchParams.get('mode') ?? 'customer';
  const reducedMotion = useReducedMotion();

  useEffect(() => { params.then(({ paymentId: id }) => { setPaymentId(id); setTimeout(() => setReady(true), 300); }); }, [params]);

  const checkout = useMemo(() => readCheckoutData(paymentId), [paymentId]);
  const isReady = checkout.paymentId === paymentId && checkout.bookingId;
  const isStripe = checkout.paymentMethod === 'stripe' && checkout.clientSecret;
  const isPayPal = checkout.paymentMethod === 'paypal' && checkout.checkoutUrl;
  const isManual =
    checkout.paymentMethod === 'bank_transfer' || checkout.paymentMethod === 'pay_later';
  const isBankTransfer = checkout.paymentMethod === 'bank_transfer';
  const noMethod = isReady && !isStripe && !isPayPal && !isManual;
  const isAgent = mode === 'agent' || checkout?.isAgent === true;
  const activeTab = useMemo((): PaymentTab => isPayPal && !isStripe ? 'paypal' : isStripe && !isPayPal ? 'card' : userTab ?? 'card', [isStripe, isPayPal, userTab]);
  const isLoading = !ready || !paymentId;

  // Flight fare conditions — fetched from the (public) booking record so the
  // sidebar shows the real refund/change rules instead of placeholder chips.
  const [flightComments, setFlightComments] = useState<ComponentProps<typeof FlightRateComments>['data'] | null>(null);
  useEffect(() => {
    if (checkout.bookingType !== 'flight' || !checkout.bookingId) return;
    let cancelled = false;
    apiRequest<any>(`/flights/bookings/${checkout.bookingId}`)
      .then((b: any) => {
        if (cancelled) return;
        const rawOffer = b?.offerSnapshot?.rawOffer;
        if (rawOffer?.conditions) { setFlightComments(duffelRateComments(rawOffer)); return; }
        const display = b?.offerSnapshot?.display;
        if (display?.refundPolicy || display?.changePolicy) {
          setFlightComments({ provider: b.provider, refund: display.refundPolicy ?? null, change: display.changePolicy ?? null, taxAmount: null });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [checkout.bookingType, checkout.bookingId]);

  const handleSuccess = useCallback(() => {
    setPaid(true); sessionStorage.removeItem('checkout_data'); clearFlowState();
    // ponytail: wallet top-ups have no booking page — send back to wallet
    if (checkout.bookingType === 'WALLET_TOPUP' || checkout.bookingId?.startsWith('topup_') || checkout.bookingId?.startsWith('ctopup_')) {
      const dest = checkout.bookingId?.startsWith('ctopup_') || (checkout.bookingType === 'WALLET_TOPUP' && !isAgent)
        ? '/wallet?topup=success'
        : '/agent/wallet?topup=success';
      setTimeout(() => router.push(dest), 1200);
      return;
    }
    const bookingKind = checkout.bookingType ?? (checkout.hotelName ? 'hotel' : 'flight');
    const manualMode =
      checkout.paymentMethod === 'bank_transfer' || checkout.paymentMethod === 'pay_later';
    const nextMode = isAgent ? 'agent' : manualMode ? 'manual' : 'customer';
    setTimeout(() => router.push(`/booking/${checkout.bookingId}/success?type=${bookingKind}&mode=${nextMode}`), 1200);
  }, [checkout, isAgent, router]);

  const handleError = useCallback((msg: string) => { setError(msg); toast.error(t('paymentFailed'), msg); }, [toast, t]);

  // ── Manual methods: receipt upload + confirm (no gateway charge) ──
  const handleReceiptFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const okType =
        file.type.startsWith('image/') || file.type === 'application/pdf';
      if (!okType) {
        toast.error(t('wrongFileType'), t('wrongFileTypeDesc'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('fileTooLarge'), t('fileTooLargeDesc'));
        return;
      }
      // Instant local preview first — the uploaded image appears immediately,
      // the server URL replaces it once the upload lands.
      const kind = file.type === 'application/pdf' ? 'pdf' : 'image';
      const localUrl = kind === 'image' ? URL.createObjectURL(file) : '';
      setReceiptPreview({ url: localUrl, kind, name: file.name });
      setUploadingReceipt(true);
      try {
        const url =
          checkout.bookingType === 'hotel'
            ? await uploadHotelReceipt(checkout.bookingId, file)
            : await uploadFlightReceipt(checkout.bookingId, file);
        setReceiptUrl(url);
        if (localUrl) URL.revokeObjectURL(localUrl);
        setReceiptPreview({ url, kind, name: file.name });
        toast.success(t('receiptUploaded'), t('receiptUploadedDesc'));
      } catch (err) {
        toast.error(t('uploadFailed'), err instanceof Error ? err.message : t('uploadFailedRetry'));
      } finally {
        setUploadingReceipt(false);
      }
    },
    [checkout.bookingId, checkout.bookingType, toast, t],
  );

  const handleManualConfirm = useCallback(() => {
    if (isBankTransfer && !receiptUrl) {
      toast.error(t('receiptRequired'), t('receiptRequiredDesc'));
      return;
    }
    setConfirmingManual(true);
    handleSuccess();
  }, [isBankTransfer, receiptUrl, toast, handleSuccess, t]);

  // ── Sidebar ────────────────────────────────────────────────

  const sidebar = (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.2 }} className="space-y-4">
      {isLoading || !isReady ? <SidebarSkele /> : (
        <>
          {/* Booking Summary */}
          <div className="rounded-2xl border border-zinc-200/70 bg-white/80 backdrop-blur-sm shadow-[0_2px_20px_rgba(3,61,74,0.04)] overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-3.5 flex items-center gap-2">
              <svg className="h-4 w-4 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight">{t('bookingSummary')}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              {checkout.hotelName ? (
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 leading-snug">{checkout.hotelName}</h4>
                  {checkout.roomName ? <p className="mt-0.5 text-xs text-zinc-500">{checkout.roomName}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {checkout.aggregatedPolicy ? (
                      checkout.aggregatedPolicy.refundable ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/50"><CheckIcon className="h-3 w-3" />{t('freeCancellation')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200/60">{t('nonRefundable')}</span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/50"><CheckIcon className="h-3 w-3" />{t('freeCancellation')}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-brand-teal/10 px-2 py-1 text-[10px] font-semibold text-brand-teal ring-1 ring-brand-teal/20"><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>{t('priceProtected')}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-zinc-900">{t('flightBooking')}</h4>
                  <span className="inline-flex items-center rounded-md bg-brand-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-teal">{t('flightBadge')}</span>
                </div>
              )}
              <div className="border-t border-zinc-100 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('total')}</span>
                  <div className="text-right">
                    {checkout.displayAmount && checkout.displayCurrency && checkout.displayCurrency !== checkout.currency ? (
                      <>
                        <span className="text-lg font-black text-brand-teal tabular-nums tracking-tight">
                          {formatPriceRaw(checkout.displayAmount, checkout.displayCurrency)}
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-0.5">{t('chargedAmount', { amount: formatPriceRaw(checkout.amount, checkout.currency) })}</p>
                      </>
                    ) : (
                      <span className="text-lg font-black text-brand-teal tabular-nums tracking-tight">
                        {formatPriceRaw(checkout.amount, checkout.currency)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400">{t('taxesFeesIncluded')}</p>
              </div>
            </div>
          </div>


          {/* Trust Badges */}
          <div className="rounded-2xl border border-zinc-200/70 bg-white p-4 space-y-3">
            {[
              { label: t('sslEncryption'), desc: t('sslDescription') },
              { label: t('cardPrivacy'), desc: t('cardPrivacyDesc') },
              { label: t('protectedBooking'), desc: t('protectedBookingDesc') },
            ].map((b, i) => (
              <motion.div key={i} initial={reducedMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease, delay: 0.3 + i * 0.08 }} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/5 text-brand-teal">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                </div>
                <div><p className="text-xs font-semibold text-zinc-800">{b.label}</p><p className="text-[10px] text-zinc-500 mt-0.5">{b.desc}</p></div>
              </motion.div>
            ))}
            <div className="border-t border-zinc-100 pt-2.5 flex items-center justify-center gap-3">
              <VisaLogo /><McLogo /><AmexLogo />
              <span className="h-3 w-px bg-zinc-200" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">PayPal</span>
            </div>
          </div>

          {/* Guarantee */}
          <p className="text-center text-[11px] text-zinc-400 px-2">{t('paymentProtectedNote')} <Link href="/contact" className="text-brand-teal hover:underline">{t('contactSupport')}</Link></p>
          {checkout.bookingType === 'flight' && flightComments && (
            <FlightRateComments data={flightComments} />
          )}
        </>
      )}
    </motion.div>
  );

  // ── Main Render ────────────────────────────────────────────

  // Back returns to the offer/detail page the user came from, not home.
  const backHref =
    checkout?.bookingType === 'hotel'
      ? getLastUrl('hotel-details') ?? '/hotels/search'
      : getLastUrl('flight-details') ?? '/flights/search';

  return (
    <BookingLayout title={t('securePayment')} backHref={backHref} backLabel={t('back')} sidebar={sidebar}>
      <div className="space-y-6">
        {/* ── Header ── */}
        <motion.div initial={reducedMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
          <div className="flex items-center gap-2.5 mb-2">
            <LockPulse />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal">{t('secureCheckout')}</span>
            {isAgent ? <span className="inline-flex items-center rounded-md bg-brand-teal/10 px-2 py-0.5 text-[10px] font-semibold text-brand-teal">{t('agentBadge')}</span> : null}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{isAgent ? t('completeAgentPayment') : t('completeYourPayment')}</h1>
          <p className="mt-2 text-sm text-zinc-500 max-w-md">{isAgent ? t('agentPaymentDescription') : t('paymentDescription')}</p>
        </motion.div>

        {/* ── Rate Held Banner ── */}
        <AnimatePresence>{isReady && !paid ? (
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease }} className="flex items-center gap-3 rounded-2xl border border-brand-teal/20 bg-brand-teal/[0.03] px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-teal/10"><svg className="h-4.5 w-4.5 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
            <div><p className="text-sm font-semibold text-brand-teal">{t('rateHeldLimited')}</p><p className="text-xs text-zinc-600 mt-0.5">{t('completeSoon')}</p></div>
          </motion.div>
        ) : null}</AnimatePresence>

        {/* ── Error Banner ── */}
        <AnimatePresence>{error && !paid ? (
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease }} className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/60 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 mt-0.5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">{t('paymentFailed')}</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
              {activeTab === 'card' && isPayPal ? <p className="text-xs text-red-600 mt-1">{t('tryDifferentCard')} <button onClick={() => setUserTab('paypal')} className="underline font-medium hover:text-red-800">{t('payWithPayPalLink')}</button>.</p> : null}
            </div>
            <button onClick={() => setError(null)} className="shrink-0 p-1 text-red-400 hover:text-red-600 transition-colors" aria-label={t('dismiss')}><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </motion.div>
        ) : null}</AnimatePresence>

        {/* ── Main Content ── */}
        {isLoading ? <LoadingState /> : !isReady ? (
          <motion.div initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }} className="rounded-2xl border border-zinc-200/70 bg-white p-10 text-center">
            <motion.div animate={reducedMotion ? {} : { rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} className="mx-auto h-12 w-12"><svg className="h-12 w-12" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="var(--color-zinc-200)" strokeWidth="3" /><circle cx="24" cy="24" r="20" stroke="var(--color-brand-teal)" strokeWidth="3" strokeLinecap="round" strokeDasharray="125.6" strokeDashoffset="31.4" /></svg></motion.div>
            <p className="mt-5 text-sm font-medium text-zinc-500">{t('loadingPaymentDetails')}</p>
            <p className="mt-1 text-xs text-zinc-400">{t('preparingCheckout')}</p>
          </motion.div>
        ) : paid ? (
            <motion.div initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease }} className="rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-teal-50/60 to-white p-10 text-center overflow-hidden relative">
              <div className="relative z-10">
                <motion.div initial={reducedMotion ? false : { scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-5">
                  <motion.svg initial={reducedMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.3, ease: 'easeInOut' }} className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></motion.svg>
                </motion.div>
                <h2 className="font-display text-2xl font-bold text-zinc-900 tracking-tight">{t('paymentSuccessful')}</h2>
                <p className="mt-2 text-sm text-zinc-500">{t('redirectingToConfirmation')}</p>
                <div className="mt-6 mx-auto w-48 h-1.5 rounded-full bg-zinc-100 overflow-hidden"><motion.div initial={reducedMotion ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.2, ease }} className="h-full rounded-full bg-gradient-to-r from-brand-teal to-emerald-400 origin-left" /></div>
              </div>
            </motion.div>
        ) : isAgent && checkout.isAgent && !checkout.clientSecret && !checkout.checkoutUrl ? (
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="rounded-2xl border border-zinc-200/70 bg-white p-10 text-center">
            <motion.div initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4"><CheckIcon className="h-8 w-8 text-emerald-600" /></motion.div>
            <h2 className="font-display text-xl font-bold text-zinc-900">{t('bookingConfirmed')}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t('walletDeductionDesc')}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/booking/${checkout.bookingId}/success?type=${checkout.bookingType ?? 'flight'}&mode=agent`}><motion.span whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-teal/20 hover:bg-[#012830] transition-colors cursor-pointer">{t('viewBooking')}</motion.span></Link>
              <Link href="/"><motion.span whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer">{t('continueSearching')}</motion.span></Link>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay: 0.1 }} className="space-y-5">
            {/* ── Manual methods: gateway-aware steps ── */}
            {isManual ? (
              <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 sm:p-6 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    {isBankTransfer ? t('payByBankTransfer') : t('payLaterHeading')}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {isBankTransfer
                      ? t('bankTransferDesc')
                      : t('payLaterDesc')}
                  </p>
                </div>
                {/* Step 1 — where to pay */}
                {isBankTransfer ? (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand-teal text-[10px] font-bold text-white">1</span>
                      {t('stepTransferTotal')}
                    </p>
                    <BankTransferDetails />
                  </div>
                ) : null}
                {/* Step 2 — receipt (bank transfer only) */}
                {isBankTransfer ? (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand-teal text-[10px] font-bold text-white">2</span>
                      {t('stepUploadReceipt')}
                    </p>
                    {!receiptPreview ? (
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-7 text-center transition-colors hover:border-brand-teal/40 hover:bg-brand-teal/[0.03]">
                        <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                        <span className="text-sm font-semibold text-zinc-700">
                          {uploadingReceipt ? t('uploading') : t('chooseReceipt')}
                        </span>
                        <span className="text-[11px] text-zinc-400">{t('receiptFormats')}</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                          className="hidden"
                          disabled={uploadingReceipt}
                          onChange={(e) => {
                            void handleReceiptFile(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-zinc-200">
                        {receiptPreview.kind === 'image' && receiptPreview.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary/local blob URL, any host
                          <img
                            src={receiptPreview.url}
                            alt={t('receiptPreviewAlt')}
                            className="max-h-72 w-full object-contain bg-zinc-50"
                          />
                        ) : (
                          <div className="flex items-center gap-3 bg-zinc-50 px-4 py-5">
                            <svg className="h-8 w-8 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-800">{receiptPreview.name}</p>
                              <p className="text-[11px] text-zinc-500">{uploadingReceipt ? t('uploading') : receiptUrl ? t('receiptUploadedState') : t('receiptReadyState')}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-white px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                            {uploadingReceipt ? (
                              <><span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-teal" /> {t('uploading')}</>
                            ) : receiptUrl ? (
                              <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('receiptSaved')}</>
                            ) : null}
                          </span>
                          <label className="cursor-pointer text-xs font-semibold text-brand-teal hover:underline">
                            {t('replaceFile')}
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                              className="hidden"
                              disabled={uploadingReceipt}
                              onChange={(e) => {
                                void handleReceiptFile(e.target.files?.[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Step 3 — confirm */}
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand-teal text-[10px] font-bold text-white">{isBankTransfer ? 3 : 2}</span>
                    {t('stepConfirmBooking')}
                  </p>
                  <button
                    type="button"
                    disabled={confirmingManual || (isBankTransfer && !receiptUrl)}
                    onClick={handleManualConfirm}
                    className="w-full rounded-xl bg-brand-teal px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-teal/20 transition-all hover:bg-[#012830] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {confirmingManual ? t('confirming') : t('confirmBookingCta')}
                  </button>
                  {isBankTransfer && !receiptUrl ? (
                    <p className="mt-1.5 text-[11px] text-zinc-400">{t('uploadReceiptHint')}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {/* ── Payment Method Tabs ── */}
            {isStripe && isPayPal ? (
              <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.15em] mb-4">{t('paymentMethod')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Card Option */}
                  <motion.button type="button" onClick={() => setUserTab('card')} whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15, ease }} className={`relative flex flex-col items-center gap-2.5 rounded-xl border-2 p-4 text-center transition-all duration-200 ${activeTab === 'card' ? 'border-brand-teal/40 bg-brand-teal/[0.03] ring-1 ring-brand-teal/20 shadow-[0_4px_16px_rgba(3,61,74,0.06)]' : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50'}`}>
                    {activeTab === 'card' ? <motion.span initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal"><svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></motion.span> : null}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${activeTab === 'card' ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                    </div>
                    <div><p className="text-sm font-semibold text-zinc-900">{t('creditCard')}</p><p className="text-[11px] text-zinc-500 mt-0.5">{t('cardBrands')}</p></div>
                    <div className="flex items-center gap-2 mt-1"><VisaLogo /><McLogo /><AmexLogo /></div>
                  </motion.button>
                  {/* PayPal Option */}
                  <motion.button type="button" onClick={() => setUserTab('paypal')} whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15, ease }} className={`relative flex flex-col items-center gap-2.5 rounded-xl border-2 p-4 text-center transition-all duration-200 ${activeTab === 'paypal' ? 'border-brand-teal/40 bg-brand-teal/[0.03] ring-1 ring-brand-teal/20 shadow-[0_4px_16px_rgba(3,61,74,0.06)]' : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50'}`}>
                    {activeTab === 'paypal' ? <motion.span initial={reducedMotion ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal"><svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></motion.span> : null}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${activeTab === 'paypal' ? 'bg-brand-teal text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" /></svg>
                    </div>
                    <div><p className="text-sm font-semibold text-zinc-900">PayPal</p><p className="text-[11px] text-zinc-500 mt-0.5">{t('paypalAccountSubtitle')}</p></div>
                  </motion.button>
                </div>
              </div>
            ) : null}

            {/* ── Stripe Card Form ── */}
            <AnimatePresence mode="wait">{isStripe && activeTab === 'card' ? <motion.div key="stripe" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease }}><StripePaymentForm clientSecret={checkout.clientSecret!} paymentId={paymentId} bookingId={checkout.bookingId} amount={checkout.amount} currency={checkout.currency} onSuccess={handleSuccess} onError={handleError} /></motion.div> : null}</AnimatePresence>

            {/* ── PayPal ── */}
            <AnimatePresence mode="wait">{isPayPal && activeTab === 'paypal' ? <motion.div key="paypal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease }}><PayPalPaymentButton paymentId={paymentId} checkoutUrl={checkout.checkoutUrl!} amount={checkout.amount} currency={checkout.currency} onSuccess={handleSuccess} onError={handleError} /></motion.div> : null}</AnimatePresence>

            {/* ── Fallback ── */}
            {noMethod ? <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="rounded-2xl border border-zinc-200/70 bg-white p-5">
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">{t('confirmPaymentTitle')}</h3>
              <p className="text-xs text-zinc-500 mb-4">{t('confirmPaymentDesc')}</p>
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => confirmPayment(paymentId).then(handleSuccess).catch((e) => handleError(e instanceof Error ? e.message : t('confirmFailedFallback')))} className="w-full rounded-xl bg-brand-teal px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-teal/20 hover:bg-[#012830] transition-colors">{t('completePayment')}</motion.button>
            </motion.div> : null}
          </motion.div>
        )}
      </div>
    </BookingLayout>
  );
}
