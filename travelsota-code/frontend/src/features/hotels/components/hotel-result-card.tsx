"use client";
import { saveScrollAnchor } from '@/lib/utils/search-cache';
import { useTranslations } from 'next-intl';

import { useCallback, memo } from "react";
import { useQuery } from '@tanstack/react-query';
import { getPriceBreakdownSetting } from '@/features/admin/api/admin-settings';
import Link from "next/link";
import { motion } from "motion/react";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuth } from '@/hooks/useAuth';

import type { CombinedHotelCard } from "@/lib/schema/hotel";
import type { RoomForm } from "../types/search-form";
import { HotelImageCarousel } from '@/components/booking/hotel-image-carousel';
import { filterDisplayAmenities, amenityLabel } from "@/lib/utils/amenity-utils";
import { SupplierGate, SupplierBadge, SupplierCount } from "@/components/shared/supplier-gate";
import { isFreeCancellationRate } from "@/lib/filters/hotel-filters";

interface HotelResultCardProps {
  hotel: CombinedHotelCard;
  checkIn?: string;
  checkOut?: string;
  roomsList?: RoomForm[];
  searchKey?: string;
  mode?: "customer" | "agent";
  /** Active search job ID — cancelled when user navigates to a hotel detail */
  searchId?: string;
}

function ratingLabel(score: number): string {
  return score >= 9 ? "Excellent" : score >= 8 ? "Very good" : score >= 7 ? "Good" : "Pleasant";
}

function ratingColor(score: number): string {
  return score >= 9 ? "bg-emerald-600" : score >= 8 ? "bg-emerald-500" : score >= 7 ? "bg-amber-500" : "bg-slate-500";
}

/**
 * The hotel name often already carries the city ("Royal Falcon Hotel Dubai").
 * When it does, repeating the city under the title and on the photo shows the
 * same word three times — hide the redundant surfaces.
 */
function nameIncludesCity(name: string | undefined, city: string | undefined): boolean {
  if (!name || !city) return false;
  const n = name.toLowerCase();
  const c = city.toLowerCase().split(/[,/]/)[0].trim();
  return c.length > 2 && n.includes(c);
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} star hotel`}>
      {Array.from({ length: rating }).map((_, i) => (
        <svg key={i} className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function LovedByItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-gray-600">
      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      <span className="truncate">{label}</span>
    </div>
  );
}

/** Props whose identity change alone must re-render the card. */
const HOTEL_CARD_ARRAY_KEYS: ReadonlyArray<keyof HotelResultCardProps> = ["roomsList"];

function hotelCardPropsAreEqual(prev: HotelResultCardProps, next: HotelResultCardProps): boolean {
  // The hotel object is replaced wholesale on every stream merge — compare the
  // cheap identity + display fields so unaffected cards skip re-render (WS4.2).
  const a = prev.hotel;
  const b = next.hotel;
  const hotelEqual =
    a === b ||
    (a.hotelGroupId === b.hotelGroupId &&
      a.displayName === b.displayName &&
      a.primaryImageUrl === b.primaryImageUrl &&
      a.minPrice?.amount === b.minPrice?.amount &&
      a.minPrice?.currency === b.minPrice?.currency &&
      a.starRating === b.starRating &&
      a.images?.length === b.images?.length &&
      a.providers?.length === b.providers?.length);
  if (!hotelEqual) return false;
  const scalarKeys: Array<keyof HotelResultCardProps> = [
    "checkIn", "checkOut", "searchKey", "searchId", "mode",
  ];
  for (const key of scalarKeys) {
    if (prev[key] !== next[key]) return false;
  }
  for (const key of HOTEL_CARD_ARRAY_KEYS) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
}

function HotelResultCardBase({
  hotel,
  checkIn,
  checkOut,
  roomsList,
  searchKey,
  searchId,
  mode = "customer",
}: HotelResultCardProps) {
  const t = useTranslations('Hotels');
  const { formatPrice } = useCurrency();
  const { isAdmin, isAgent } = useAuth();
  const { data: breakdownSetting } = useQuery({
    queryKey: ['public', 'settings', 'price-breakdown'],
    queryFn: getPriceBreakdownSetting,
    staleTime: 60_000,
  });
  // Breakdown is admin/staff-only (agents, customers, guests never see supplier
  // cost or markup) AND respects the Price Breakdown toggle in Settings → General.
  const showPriceBreakdown = isAdmin && (breakdownSetting?.showPriceBreakdown ?? false);

  const firstProvider = hotel.providers?.[0];
  const roomCount = hotel.providers?.reduce((sum, p) => sum + (p.rateCount ?? 0), 0) ?? 0;
  const destinationName = hotel.location?.city;
  // City dedup: only surface the city line when the name doesn't already say it.
  const cityIsRedundant = nameIncludesCity(hotel.displayName, destinationName);

  const roomAdults = roomsList?.map((r) => Number(r.adults)).join(",") ?? "1";
  const roomChildren = roomsList?.map((r) => Number(r.children) || 0).join(",") ?? "0";
  const roomChildAges = roomsList
    ? JSON.stringify(roomsList.map((r) => r.childAges.trim() ? r.childAges.split(',').map(Number).filter(Number.isFinite) : []))
    : "[]";

  const occupancySummary = roomsList && roomsList.length > 0
    ? (() => {
        const totalAdults = roomsList.reduce((s, r) => s + (Number(r.adults) || 0), 0);
        const totalChildren = roomsList.reduce((s, r) => s + (Number(r.children) || 0), 0);
        const parts: string[] = [];
        if (totalAdults > 0) parts.push(`${totalAdults} adult${totalAdults !== 1 ? 's' : ''}`);
        if (totalChildren > 0) parts.push(`${totalChildren} child${totalChildren !== 1 ? 'ren' : ''}`);
        return parts.length > 0 ? parts.join(', ') : null;
      })()
    : null;

  const fallbackRate = firstProvider?.minRate;
  // Unified flow (QA 2026-09-09): every role goes card → hotel details page →
  // pick a room → booking form. Agents keep agent pricing via &mode=agent.
  const detailHref =
    `/hotels/${encodeURIComponent(hotel.hotelGroupId)}` +
    `?searchKey=${encodeURIComponent(searchKey ?? "")}` +
    `&checkIn=${checkIn ? encodeURIComponent(checkIn) : ""}` +
    `&checkOut=${checkOut ? encodeURIComponent(checkOut) : ""}` +
    `&room_adults=${roomAdults}` +
    `&room_children=${roomChildren}` +
    `&room_child_ages=${encodeURIComponent(roomChildAges)}` +
    `&hotelName=${encodeURIComponent(hotel.displayName)}` +
    `&destination=${encodeURIComponent(destinationName ?? "")}` +
    `&provider=${encodeURIComponent(firstProvider?.provider ?? "")}` +
    `&providerHotelId=${encodeURIComponent(firstProvider?.providerHotelId ?? "")}` +
    (mode === "agent" ? "&mode=agent" : "");

  const heroImage = hotel.primaryImageUrl ?? hotel.images?.[0];
  const allAmenities = filterDisplayAmenities(hotel.amenitiesPreview ?? hotel.amenities ?? []);
  const displayAmenities = allAmenities.slice(0, 4);
  const extraAmenities = allAmenities.length - 4;

  const guestRatingScore = hotel.guestRating ?? null;

  const providerLabel = (p: string) =>
    p === "hotelbeds" ? "Hotelbeds" : p === "ratehawk" ? "RateHawk" : p;

  const boardName = hotel.providers.flatMap((p) => (p.minRate?.boardName ? [p.minRate.boardName] : []))[0];

  const anyFreeCancellation = (hotel.providers ?? []).some((p) =>
    isFreeCancellationRate(p.minRate),
  );

  const allNonRefundable = (hotel.providers ?? []).length > 0 && (hotel.providers ?? []).every((p) =>
    !isFreeCancellationRate(p.minRate),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group relative rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-teal/40 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] w-full min-w-0 overflow-hidden"
    >
      {/* Hover guidance accent */}
      <span className="absolute inset-y-0 left-0 z-[1] w-1 origin-top scale-y-0 rounded-l-2xl bg-gradient-to-b from-brand-teal to-[#0a5a6b] transition-transform duration-300 group-hover:scale-y-100" />

      {/* Whole-card link (customer) — opens detail in a new tab so the search stays intact. */}
      <Link
        href={detailHref}
        prefetch={false}
        target="_blank"
        rel="noopener"
        aria-label={`View ${hotel.displayName} (opens in a new tab)`}
        className="absolute inset-0 z-0"
        onClick={() => saveScrollAnchor('hotels', hotel.hotelGroupId)}
      />

      <div className="pointer-events-none relative flex flex-col sm:flex-row min-w-0">
        {/* Image carousel */}
        <div className="pointer-events-auto relative w-full shrink-0 sm:w-48 lg:w-56 h-48 sm:h-auto sm:min-h-[180px] overflow-hidden">
          <HotelImageCarousel
            images={hotel.images ?? []}
            alt={hotel.displayName}
            fillHeight
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none" />

          {hotel.providers.length > 0 && (
            <SupplierGate>
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                {hotel.providers.filter((p) => p.available).slice(0, 2).map((p) => (
                  <SupplierBadge key={p.provider} name={providerLabel(p.provider)} />
                ))}
              </div>
            </SupplierGate>
          )}

          {/* City badge on the photo ONLY when the title doesn't already carry it. */}
          {destinationName && !cityIsRedundant && (
            <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 text-[11px] font-medium text-white/95 backdrop-blur-sm">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {destinationName}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-charcoal">{hotel.displayName}</h3>
            {!cityIsRedundant && destinationName ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StarRating rating={hotel.starRating ?? 0} />
                <span className="inline-flex items-center gap-1 text-xs text-[#7d7d7d]">
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {destinationName}
                </span>
              </div>
            ) : hotel.starRating && hotel.starRating > 0 ? (
              <div className="mt-1">
                <StarRating rating={hotel.starRating} />
              </div>
            ) : null}
          </div>

          {hotel.descriptionShort && (
            <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-gray-500">
              {hotel.descriptionShort}
            </p>
          )}

          {displayAmenities.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-brand-teal">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
                Popular amenities
              </p>
              <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
                {displayAmenities.map((a) => (
                  <LovedByItem key={a} label={amenityLabel(a)} />
                ))}
              </div>
              {extraAmenities > 0 && (
                <span className="mt-1 inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                  +{extraAmenities}
                </span>
              )}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {boardName && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
                {boardName}
              </span>
            )}
            {occupancySummary && (
              <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700">
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.208V5.792a2 2 0 012.228-1.986h13.544A2 2 0 0121 5.792v11.416a2 2 0 01-2.228 1.986" />
                </svg>
                {occupancySummary}
              </span>
            )}
            {<SupplierCount count={hotel.providers.length} />}
          </div>
        </div>

        {/* Price rail */}
        <div className="flex items-center justify-between gap-3 border-t border-dashed border-gray-200 px-4 py-3 sm:w-44 sm:shrink-0 sm:flex-col sm:items-stretch sm:justify-center sm:border-l sm:border-t-0 sm:px-4 sm:text-right">
          {guestRatingScore ? (
            <div className="flex items-center gap-2 sm:flex-row-reverse sm:justify-end">
              <span className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-bold text-white ${ratingColor(guestRatingScore)}`}>
                {guestRatingScore.toFixed(1)}
              </span>
              <div className="leading-tight sm:text-right">
                <p className="text-xs font-bold text-charcoal">{ratingLabel(guestRatingScore)}</p>
                <p className="text-[10px] text-gray-400">Guest rating</p>
              </div>
            </div>
          ) : <span />}

          <div className="sm:mt-4">
            {hotel.minPrice ? (
              (() => {
                const dp = hotel.pricing?.displayPrice;
                // Instant price: pre-enrichment, convert the raw supplier
                // minPrice client-side into the selected currency on first
                // paint (same convertAmount path as everywhere else). When the
                // backend displayPrice lands it replaces an already-correct
                // number — no skeleton wait, no flash.
                // minPrice.amount / pricing.displayPrice.amount is the TOTAL
                // for the entire stay (all nights), not per-night.
                const stayTotal = dp?.amount ?? hotel.minPrice.amount;
                const cur = dp?.currency ?? hotel.minPrice.currency;
                const markupPct = firstProvider?.minRate?.markupPercent;
                const nights = checkIn && checkOut
                  ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
                  : 1;
                const perNight = nights > 1 ? stayTotal / nights : stayTotal;
                return (
                  <>
                    <p className="text-2xl font-black text-brand-teal tabular-nums tracking-tight">
                      {formatPrice(perNight, cur)}
                    </p>
                    <p className="text-[11px] text-gray-500">per night</p>
                    {nights > 1 && (
                      <p className="mt-0.5 text-xs font-medium text-gray-600 tabular-nums">
                        {formatPrice(stayTotal, cur)} total · {nights} night{nights !== 1 ? "s" : ""}
                      </p>
                    )}
                    {markupPct != null && markupPct > 0 && showPriceBreakdown && (
                      <div className="mt-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/70">Price breakdown</p>
                        {(() => {
                          // Breakdown values are also totals — divide by nights
                          // so they match the per-night main price display.
                          const baseDisp = hotel.minPrice?.supplierBaseInDisplay != null
                            ? hotel.minPrice.supplierBaseInDisplay / nights : undefined;
                          const mkDisp = hotel.minPrice?.markupInDisplay != null
                            ? hotel.minPrice.markupInDisplay / nights : undefined;
                          return (
                            <>
                              {baseDisp != null ? (
                                <p className="text-[10px] text-gray-500 tabular-nums">
                                  Supplier {formatPrice(baseDisp, cur)}
                                </p>
                              ) : null}
                              <p className="text-[10px] font-semibold text-emerald-700 tabular-nums">
                                + Markup{' '}
                                {mkDisp != null
                                  ? formatPrice(mkDisp, cur)
                                  : `${markupPct.toFixed(1)}%`}
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <p className="text-sm text-gray-500">Price on request</p>
            )}

            <span className="mt-3 hidden items-center justify-end gap-1 rounded-full bg-brand-teal/10 px-3 py-1.5 text-xs font-bold text-brand-teal transition-all duration-300 group-hover:bg-brand-teal group-hover:text-white sm:inline-flex">
              View rooms
              <svg className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
            {anyFreeCancellation ? (
              <span className="mt-2 inline-flex items-center justify-end gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Free cancellation
              </span>
            ) : allNonRefundable ? (
              <span className="mt-2 inline-flex items-center justify-end gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200/60">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Non-refundable
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Memoized: skips re-render when the card's visible data is unchanged (WS4.2). */
export const HotelResultCard = memo(HotelResultCardBase, hotelCardPropsAreEqual);
