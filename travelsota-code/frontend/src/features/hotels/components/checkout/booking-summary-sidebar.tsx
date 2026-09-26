"use client";
import { useTranslations } from 'next-intl';


import { motion } from "motion/react";
import Image from "next/image";
import { formatPolicyDate } from '@/lib/utils/cancellation-policy';

const ease = [0.16, 1, 0.3, 1] as const;

interface BookingSummarySidebarProps {
  hotelImage?: string;
  hotelName: string;
  starRating?: number;
  location?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  nationality?: string;
  roomName: string;
  boardName?: string;
  pricePerNight: number;
  currency: string;
  totalPrice: number;
  roomQuantity?: number;
  breakfastIncluded?: boolean;
  refundable?: boolean;
  freeCancellation?: boolean;
  /** Unified label from the shared cancellation-policy helper. */
  cancellationLabel?: string;
  cancellationPolicies?: Array<{
    amount?: string | number;
    /** Currency `amount` is denominated in — set by the backend's per-policy
     *  conversion (HotelDetailsOrchestratorService.convertCancellationPolicies). */
    currency?: string;
    from?: string;
    to?: string;
    percentage?: string | number;
    numberOfNights?: number;
  }>;
  /** Aggregated policy from backend — when provided, used for all display. */
  aggregatedPolicy?: import('@/lib/schema/hotel').AggregatedPolicy;
  formatPrice: (amount: number, currency: string) => string;
}

function StarRating({ rating, label }: { rating: number; label: string }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={label}>
      {Array.from({ length: rating }).map((_, i) => (
        <motion.svg
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.3, ease }}
          className="h-3.5 w-3.5 text-amber-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </motion.svg>
      ))}
    </div>
  );
}

function formatDateShort(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function BookingSummarySidebar({
  hotelImage,
  hotelName,
  starRating,
  location,
  checkIn,
  checkOut,
  nights,
  nationality,
  roomName,
  boardName,
  pricePerNight,
  currency,
  totalPrice,
  roomQuantity = 1,
  breakfastIncluded,
  refundable,
  freeCancellation,
  cancellationLabel,
  cancellationPolicies,
  aggregatedPolicy: agg,
  formatPrice,
}: BookingSummarySidebarProps) {
  const t = useTranslations('Checkout');
  const starLabel = t('starRatingLabel', { rating: starRating ?? 0 });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay: 0.15 }}
      className="lg:sticky lg:top-6 space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_16px_rgba(3,61,74,0.06)]">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-charcoal tracking-tight">{t('bookingSummary')}</h2>
        </div>

        {hotelImage && (
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <Image
              src={hotelImage}
              alt={hotelName}
              fill
              sizes="(max-width: 1024px) 100vw, 400px"
              className="object-cover scale-105 transition-transform duration-700 hover:scale-110"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-base font-bold capitalize text-white drop-shadow-lg line-clamp-2">
                {hotelName}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                {starRating && starRating > 0 ? <StarRating rating={starRating} label={starLabel} /> : null}
                {location ? (
                  <span className="text-[11px] text-white/80 flex items-center gap-1 truncate">
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="px-5 py-4 space-y-5">
          {!hotelImage && (
            <div>
              <h3 className="text-base font-bold capitalize text-charcoal">{hotelName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {starRating && starRating > 0 ? <StarRating rating={starRating} label={starLabel} /> : null}
              </div>
              {location ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {location}
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-2.5 rounded-xl bg-zinc-50/80 px-3.5 py-3.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t('checkInLabel')}</span>
              <span className="font-semibold text-charcoal">{formatDateShort(checkIn)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t('checkOutLabel')}</span>
              <span className="font-semibold text-charcoal">{formatDateShort(checkOut)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t('durationLabel')}</span>
              <span className="font-medium text-charcoal">
                {t('stayNights', { count: nights })}
              </span>
            </div>
            {nationality ? (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{t('nationality')}</span>
                <span className="font-medium text-charcoal">{nationality}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-200/80 p-3.5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-charcoal">{roomName}</p>
              {boardName ? <p className="text-xs text-zinc-500 mt-0.5">{boardName}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {breakfastIncluded ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/50">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('breakfastIncluded')}
                </span>
              ) : null}
              {agg?.refundable ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200/50">
                  {t('refundable')}
                </span>
              ) : refundable ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200/50">
                  {t('refundable')}
                </span>
              ) : null}
              {agg?.refundable ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/50">
                  {t('freeCancellation')}
                </span>
              ) : freeCancellation ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/50">
                  {t('freeCancellation')}
                </span>
              ) : cancellationLabel ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200/50">
                  {cancellationLabel}
                </span>
              ) : null}
            </div>
            {agg?.displayText ? (
              <div className="space-y-1 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                <p className="font-semibold uppercase tracking-wide text-zinc-400 text-[10px]">{t('cancellationPolicyTitle')}</p>
                <p className="text-zinc-600">{agg.displayText}</p>
              </div>
            ) : cancellationPolicies && cancellationPolicies.length > 0 ? (
              <div className="space-y-1 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                <p className="font-semibold uppercase tracking-wide text-zinc-400 text-[10px]">{t('cancellationPolicyTitle')}</p>
                {cancellationPolicies.map((p, i) => {
                  const free = Number(p.amount ?? 0) === 0 && Number(p.percentage ?? 0) === 0 && Number(p.numberOfNights ?? 0) === 0;
                  const amount = p.amount != null ? Number(p.amount) : null;
const fromLabel = p.from
    ? t('cancelByDate', { date: formatPolicyDate(p.from) })
    : t('bookingStart');
                  return (
                    <p key={i}>
                      {fromLabel}:{" "}
                      <span className={free ? "font-medium text-emerald-600" : "font-medium text-zinc-700"}>
                        {free ? t('cancellationFree') : amount != null ? t('policyFee', { amount: p.currency ? `${p.currency} ${amount}` : `${amount}` }) : t('feeApplies')}
                      </span>
                    </p>
                  );
                })}
              </div>
            ) : null}
            <div className="space-y-1.5 border-t border-zinc-100 pt-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">{t('pricePerNight')}</span>
                <span className="font-medium text-charcoal tabular-nums">
                  {formatPrice(pricePerNight, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">
                  {t('nightsTimesRooms', { count: nights, rooms: roomQuantity })}
                </span>
                <span className="font-medium text-charcoal tabular-nums">
                  {formatPrice(pricePerNight * nights * roomQuantity, currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t('roomsTotal')}</span>
              <span className="font-semibold text-charcoal tabular-nums">{formatPrice(totalPrice, currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">{t('taxesFees')}</span>
              <span className="text-[13px] text-emerald-600 font-semibold">{t('included')}</span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2.5">
              <span className="text-base font-bold text-charcoal">{t('total')}</span>
              <span className="text-lg font-black text-brand-teal tabular-nums tracking-tight">
                {formatPrice(totalPrice, currency)}
              </span>
            </div>
          </div>


          <div className="space-y-2.5 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100/50 px-4 py-3.5 text-[13px]">
            <div className="flex items-center gap-2.5 text-zinc-600">
              <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <span className="font-medium">{t('confirmationEmail')}</span>
            </div>
            <div className="flex items-center gap-2.5 text-zinc-600">
              <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="font-medium">{t('paymentSecure')}</span>
            </div>
            <div className="flex items-center gap-2.5 text-zinc-600">
              <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              <span className="font-medium">{t('noHiddenChargesFull')}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
