"use client";

import { use, useEffect, useState, useMemo, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "@/context/CurrencyContext";
import { apiRequest } from "@/lib/api/client";
import { ROUTES } from "@/lib/routes";
import { getLastUrl, saveLastUrl } from "@/lib/utils/search-cache";
import type {
  CombinedHotelDetailsResponse,
} from "@/features/hotels/api/get-hotel-details";
import { LoadingBox } from "@/components/ui/state/loading-box";
import { ErrorBox } from "@/components/ui/state/error-box";
import { Button } from "@/components/ui/button";
import { HotelGallery } from "@/features/hotels/components/hotel-gallery";
import { RoomList } from "@/features/hotels/components/room";
import { HotelRateComments } from "@/features/hotels/components/hotel-rate-comments";
import {
  isDisplayAmenity,
  amenityLabel,
} from "@/lib/utils/amenity-utils";
import type { AggregatedPolicy } from "@/lib/schema/hotel";

/** Compute AggregatedPolicy from raw cancellation policies (frontend fallback). */
function computeAggregatedPolicy(
  supplier: string,
  refundable: boolean,
  policies: Array<{ amount?: string | number; from?: string; deadline?: string; percentage?: string | number; numberOfNights?: number }> | undefined,
): AggregatedPolicy | null {
  if (!policies?.length && !refundable) return null;

  const now = Date.now();
  const sortedPolicies = [...(policies ?? [])]
    .filter((p) => p.from ?? p.deadline)
    .sort((a, b) => new Date(a.from ?? a.deadline ?? 0).getTime() - new Date(b.from ?? b.deadline ?? 0).getTime());

  // Find free cancellation deadline (latest zero-fee deadline)
  const freeDeadline = refundable
    ? sortedPolicies
        .filter((p) => Number(p.amount ?? 0) === 0 && Number(p.percentage ?? 0) === 0 && Number(p.numberOfNights ?? 0) === 0)
        .map((p) => p.from ?? p.deadline)
        .filter(Boolean)
        .sort()[0] ?? null
    : null;

  // Find applicable fee (most recent passed deadline)
  const applicable = sortedPolicies.filter((p) => {
    const d = new Date(p.from ?? p.deadline ?? 0);
    return Number.isFinite(d.getTime()) && d.getTime() <= now;
  }).reverse();

  const feeAmount = applicable.length > 0 ? Number(applicable[0].amount ?? 0) : null;

  // Build display text
  let displayText: string;
  if (refundable && freeDeadline) {
    displayText = `Free cancellation until ${new Date(freeDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}.`;
  } else if (refundable) {
    displayText = "Free cancellation.";
  } else if (feeAmount && feeAmount > 0) {
    displayText = `Cancellation fee: ${feeAmount}.`;
  } else {
    displayText = "Non-refundable rate.";
  }

  return {
    refundable,
    freeCancellationUntil: freeDeadline,
    cancellationFee: feeAmount,
    feeType: feeAmount !== null ? "flat" : null,
    modificationAllowed: true,
    displayText,
    rateComments: "",
    rawPolicies: policies ?? [],
    supplier,
  };
}

const TEAL = "var(--color-brand-teal)";
const TEAL_HOVER = "#012830";
const ease = [0.16, 1, 0.3, 1] as const;

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: rating }).map((_, i) => (
        <svg
          key={i}
          className="h-3.5 w-3.5 text-brand-teal"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function HotelDetailPageInner({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tHotels = useTranslations("Hotels");
  const tCheckout = useTranslations("Checkout");
  const { formatPrice, selectedCurrency } = useCurrency();

  const searchKey = searchParams.get("searchKey") ?? "";
  const checkIn = searchParams.get("checkIn") ?? "";
  const checkOut = searchParams.get("checkOut") ?? "";
  const roomAdults = searchParams.get("room_adults") ?? "1";
  const roomChildren = searchParams.get("room_children") ?? "0";
  const roomChildAges = searchParams.get("room_child_ages") ?? "[]";
  const destination = searchParams.get("destination") ?? "";
  const hotelNameParam = searchParams.get("hotelName") ?? "";
  const providerParam = searchParams.get("provider") ?? "";
  const providerHotelIdParam = searchParams.get("providerHotelId") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [combined, setCombined] =
    useState<CombinedHotelDetailsResponse | null>(null);
  const [selectedRateKey, setSelectedRateKey] = useState<string | null>(null);

  // Build gallery images: prefer Cloudinary/HTTP URLs over local placeholder
  // paths (which 400 in Next.js Image optimizer since the files don't exist).
  const galleryImages = useMemo(() => {
    if (!combined) return [];
    const { content, hotel } = combined;

    // Helper: a URL is usable if it's an absolute http(s) URL
    const isHttpUrl = (u?: string) =>
      !!u && (u.startsWith("http://") || u.startsWith("https://"));

    // 1) Prefer Cloudinary URLs from hotel.images (canonical source)
    const cloudinaryUrls = (hotel.images ?? []).filter(
      (url) => url?.startsWith("https://res.cloudinary.com/"),
    );
    if (cloudinaryUrls.length > 0) {
      const contentImgs = content.images ?? [];
      return cloudinaryUrls.map((url, i) => ({
        url,
        thumbnailUrl: url,
        caption: contentImgs[i]?.caption,
        category: contentImgs[i]?.category,
        isPrimary: i === 0,
        sortOrder: i,
      }));
    }

    // 2) Fall back to structured content images, but only HTTP(S) URLs
    const validContent = (content.images ?? []).filter((img) =>
      isHttpUrl(img.url),
    );
    if (validContent.length > 0) return validContent;

    // 3) Last resort: any HTTP URL from hotel.images
    const anyHttpFromHotel = (hotel.images ?? []).filter(isHttpUrl);
    return anyHttpFromHotel.map((url, i) => ({
      url,
      thumbnailUrl: url,
      isPrimary: i === 0,
      sortOrder: i,
    }));
  }, [combined]);

  // Remember this detail URL so checkout's back button can return here.
  useEffect(() => {
    saveLastUrl('hotel-details', window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const decodedHotelId = decodeURIComponent(hotelId);

    // Occupancy from URL params — sent as fallback criteria for a direct
    // re-search when the cached search session is unavailable.
    const fallbackRooms = (() => {
      try {
        const adultsArr = roomAdults.split(',').map(Number);
        const childrenArr = roomChildren.split(',').map(Number);
        const agesArr = JSON.parse(roomChildAges);
        const maxRooms = Math.max(adultsArr.length, childrenArr.length);
        return Array.from({ length: maxRooms }, (_, i) => ({
          adults: adultsArr[i] || 1,
          children: childrenArr[i] || 0,
          childAges: Array.isArray(agesArr[i]) ? agesArr[i] : [],
        }));
      } catch {
        return [{ adults: 1, children: 0 }];
      }
    })();

    function fetchWithSearchKey(skey: string) {
      return apiRequest(ROUTES.HOTELS.DETAILS, {
        method: "POST",
        body: {
          searchKey: skey,
          hotelId: decodedHotelId,
          hotelGroupId: decodedHotelId,
          provider: providerParam || undefined,
          providerHotelId: providerHotelIdParam || undefined,
          displayCurrency: selectedCurrency.code,
          checkIn: checkIn || undefined,
          checkOut: checkOut || undefined,
          rooms: fallbackRooms,
          hotelName: hotelNameParam || undefined,
          destinationName: destination || undefined,
        },
      });
    }

    function fetchWithoutSearchKey() {
      return apiRequest(ROUTES.HOTELS.DETAILS, {
        method: "POST",
        body: {
          hotelId: decodedHotelId,
          hotelGroupId: decodedHotelId,
          provider: providerParam || undefined,
          providerHotelId: providerHotelIdParam || undefined,
          displayCurrency: selectedCurrency.code,
          checkIn: checkIn || undefined,
          checkOut: checkOut || undefined,
          rooms: fallbackRooms,
          hotelName: hotelNameParam || undefined,
          destinationName: destination || undefined,
        },
      });
    }

    if (searchKey) {
      fetchWithSearchKey(searchKey)
        .then((res: any) => {
          const data = res as CombinedHotelDetailsResponse;
          if (data.providerSections?.length === 0 || data.providerSections?.every((s) => s.rates.length === 0)) {
            fetchWithoutSearchKey().then((r: any) => { setCombined(r); setLoading(false); }).catch((err: Error) => { setError(err.message || "Failed to load hotel details."); setLoading(false); });
          } else {
            setCombined(data);
            setLoading(false);
          }
        })
        .catch(() => {
          fetchWithoutSearchKey()
            .then((res: any) => {
              setCombined(res as CombinedHotelDetailsResponse);
              setLoading(false);
            })
            .catch((err: Error) => {
              setError(err.message || "Failed to load hotel details.");
              setLoading(false);
            });
        });
    } else {
      // No searchKey at all — try direct fetch by groupId
      fetchWithoutSearchKey()
        .then((res: any) => {
          setCombined(res as CombinedHotelDetailsResponse);
          setLoading(false);
        })
        .catch((err: Error) => {
          setError(err.message || "Failed to load hotel details.");
          setLoading(false);
        });
    }
  }, [searchKey, hotelId, providerParam, providerHotelIdParam, selectedCurrency.code]);

  if (loading)
    return (
      <div className="mx-auto max-w-5xl py-16 px-4">
        <LoadingBox message={tHotels("hotelLoadingDetails")} />
      </div>
    );

  if (error)
    return (
      <div className="mx-auto max-w-5xl py-16 px-4">
        <ErrorBox
          message={error}
          onRetry={() => window.location.reload()}
        />
      </div>
    );

  if (!combined) return null;

  // Parse occupancy from URL params for room filtering
  const requestedOccupancy = (() => {
    try {
      const adultsArr = roomAdults.split(',').map(Number);
      const childrenArr = roomChildren.split(',').map(Number);
      const agesArr = JSON.parse(roomChildAges);
      const maxRooms = Math.max(adultsArr.length, childrenArr.length);
      const rooms = Array.from({ length: maxRooms }, (_, i) => ({
        adults: adultsArr[i] || 1,
        children: childrenArr[i] || 0,
        childAges: Array.isArray(agesArr[i]) ? agesArr[i] : [],
      }));
      const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
      const totalChildren = rooms.reduce((s, r) => s + r.children, 0);
      return { rooms, totalAdults, totalChildren, totalGuests: totalAdults + totalChildren, roomCount: rooms.length };
    } catch {
      return null;
    }
  })();

  const { content, hotel, providerSections } = combined;
  const nights = (() => {
    if (!checkIn || !checkOut) return 1;
    return Math.max(
      1,
      Math.round(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
  })();

  // Compute selectedRate across all provider sections for the sticky CTA + checkout handoff
  const allRates = providerSections.flatMap((s) => s.rates);
  const selectedRate = allRates.find((r) => r.rateId === selectedRateKey);

  const primaryImage = content.images?.[0]?.url ?? hotel.images?.[0];

  const checkoutParams = selectedRate
    ? (() => {
        // Prefer marked/converted pricing, then customerPrice — raw supplier
        // price only as a last resort. Rate amounts are STAY totals, so do
        // NOT multiply by nights here (double-multiplication fix).
        const rateDisplayPrice = selectedRate.pricing?.displayPrice ?? selectedRate.customerPrice ?? selectedRate.supplierPrice;
        return new URLSearchParams({
          hotelId,
          searchKey,
          rateId: selectedRate.rateId,
          roomName: selectedRate.roomName ?? "",
          boardName: selectedRate.boardName ?? "",
          price: String(rateDisplayPrice.amount),
          currency: rateDisplayPrice.currency,
          room_adults: roomAdults,
          room_children: roomChildren,
          room_child_ages: roomChildAges,
          checkIn,
          checkOut,
          hotelName: hotelNameParam,
          destination,
          provider: selectedRate.provider,
          providerHotelId: selectedRate.providerHotelId,
          hotelImage: primaryImage ?? "",
          starRating: hotel.starRating != null ? String(hotel.starRating) : "",
        }).toString();
      })()
    : "";

  const resolvedAmenities = (content.amenities ?? [])
    .map((a) => ({ ...a, name: a.name || amenityLabel(a.code) }))
    .filter((a) => isDisplayAmenity(a.name))
    .slice(0, 10);

  const hotelDisplayName = content.name || hotel.displayName;
  const address =
    content.address ||
    hotel.address ||
    [hotel.location?.city, hotel.location?.country].filter(Boolean).join(", ") ||
    destination;
  const lat = content.location?.latitude ?? hotel.location?.latitude;
  const lng = content.location?.longitude ?? hotel.location?.longitude;
  const mapsUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotelDisplayName} ${address}`)}`;

  return (
    <div className="min-h-dvh bg-white dark:bg-void">
      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="mx-auto max-w-5xl px-4 pb-1 pt-6 sm:px-6"
      >
        <button
          type="button"
          onClick={() => {
            // New-tab flow: history may be empty — fall back to the remembered search.
            const back = getLastUrl('hotels-search');
            if (back && window.history.length <= 2) {
              router.push(back);
            } else {
              router.back();
            }
          }}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-teal/10 bg-white px-3 py-1.5 text-xs font-semibold text-brand-teal transition hover:-translate-y-0.5 hover:border-brand-teal/40"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {tHotels("hotelBackToResults")}
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {hotel.starRating != null && hotel.starRating > 0 && <StarRating rating={hotel.starRating} />}
          {checkIn && checkOut && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/10 px-2.5 py-1 text-[11px] font-semibold text-brand-teal">
              {formatDate(checkIn)} → {formatDate(checkOut)} · {tHotels("nightsCount", { count: nights })}
            </span>
          )}
        </div>
        <h1 className="mt-2 font-[var(--font-traavellio-display)] text-3xl font-semibold tracking-tight text-charcoal dark:text-white sm:text-4xl">
          {hotelDisplayName}
        </h1>
        {address && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-[#7d7d7d] dark:text-gray-400">
            <svg className="h-4 w-4 shrink-0 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {address}
          </p>
        )}
      </motion.header>

      {/* ── Gallery ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease, delay: 0.08 }}>
        <HotelGallery images={galleryImages} hotelName={hotelDisplayName} />
      </motion.div>

      <div className="mx-auto max-w-5xl px-4 pb-40 sm:px-6">
        {/* ── About + Key amenities ── */}
        <section className="grid grid-cols-1 gap-8 py-9 md:grid-cols-5">
          <div className="md:col-span-3">
            <h2 className="text-lg font-bold tracking-tight text-charcoal dark:text-white">{tHotels("hotelAboutTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#545454] dark:text-gray-400">
              {content.description || tHotels("hotelAboutFallback")}
            </p>
          </div>
          {resolvedAmenities.length > 0 && (
            <div className="md:col-span-2">
              <h2 className="text-lg font-bold tracking-tight text-charcoal dark:text-white">{tHotels("hotelAmenitiesTitle")}</h2>
              <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {resolvedAmenities.slice(0, 10).map((a, i) => (
                  <div key={a.code + i} className="flex items-center gap-2 text-sm text-[#545454] dark:text-gray-300">
                    <svg className="h-4 w-4` shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="truncate">{a.name}</span>
                  </div>
                ))}
              </div>
              {resolvedAmenities.length > 10 && (
                <p className="mt-2 text-xs font-medium text-[#7d7d7d] dark:text-gray-500">{tHotels("hotelMoreAmenities", { count: resolvedAmenities.length - 10 })}</p>
              )}
            </div>
          )}
        </section>

        {/* ── Policies ── */}
       

        {/* ── Rooms (RoomList with backend rooms[] + fallback to flat grouping) ── */}
        <section className="border-t border-brand-teal/10 pt-8">
          <h2 className="mb-5 text-xl font-bold tracking-tight text-charcoal dark:text-white">
            {tHotels("hotelChooseRoom")}
          </h2>
          <RoomList
            providerSections={providerSections}
            selectedRateKey={selectedRateKey}
            nights={nights}
            onSelect={setSelectedRateKey}
            requestedOccupancy={requestedOccupancy}
            galleryImages={
              galleryImages
                ? (galleryImages as Array<string | { url?: string }>).map((g) =>
                    typeof g === "string" ? g : (g.url ?? "")
                  )
                : undefined
            }
          />
        </section>

        {/* ── Location ── */}
        <section className="border-t border-brand-teal/10 pt-8 mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-charcoal dark:text-white">{tHotels("hotelLocationTitle")}</h2>
              {address && <p className="mt-1 text-sm text-[#7d7d7d] dark:text-gray-400">{address}</p>}
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#012830]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {tHotels("hotelOpenInMaps")}
            </a>
          </div>
          {lat != null && lng != null && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-brand-teal/10 shadow-sm">
              <iframe
                title={tHotels("hotelMapTitle")}
                className="h-72 w-full"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012}%2C${lat - 0.008}%2C${lng + 0.012}%2C${lat + 0.008}&layer=mapnik&marker=${lat}%2C${lng}`}
              />
            </div>
          )}
        </section>
      </div>

      {/* ── Sticky CTA ── */}
      <AnimatePresence>
        {selectedRate && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease }}
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-teal/10 dark:border-white/8 shadow-2xl backdrop-blur-xl bg-white/95 dark:bg-gray-900/95"
          >
            <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 flex items-center gap-3">
                <div className="hidden sm:flex h-10 w-10 rounded-lg bg-brand-teal/10 dark:bg-white/8 items-center justify-center">
                  <svg
                    className="h-5 w-5 text-brand-teal dark:text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-[#7d7d7d] dark:text-gray-500">
                    {selectedRate.roomName || tCheckout("roomLabel")} · {selectedRate.boardName || tHotels("hotelBoardFallback")}
                  </p>
                  <p className="text-sm font-semibold text-charcoal dark:text-white">
                    {(() => {
                      const ctaDisplayPrice = selectedRate.pricing?.displayPrice ?? selectedRate.customerPrice ?? selectedRate.supplierPrice;
                      const ctaPerNight = nights > 1 ? ctaDisplayPrice.amount / nights : ctaDisplayPrice.amount;
                      return (
                        <>
                          {formatPrice(ctaPerNight, ctaDisplayPrice.currency)}{" "}
                          <span className="text-xs font-normal text-[#7d7d7d]">
                            {tHotels("hotelStickyPriceSuffix", {
                              total: formatPrice(ctaDisplayPrice.amount, ctaDisplayPrice.currency),
                            })}
                          </span>
                        </>
                      );
                    })()}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => router.push(`/booking/hotels/${encodeURIComponent(selectedRate!.rateId)}/details?${checkoutParams}`)}
                size="lg"
                className="shrink-0 font-semibold !rounded-xl border-0 text-white shadow-lg shadow-brand-teal/20"
                style={{ backgroundColor: TEAL }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = TEAL_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = TEAL;
                }}
              >
                {tHotels("hotelContinueButton")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HotelDetailPage({ params }: HotelDetailPageProps) {
  const tCommon = useTranslations("Common");
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl py-16 px-4">
          <LoadingBox message={tCommon("loading")} />
        </div>
      }
    >
      <HotelDetailPageInner hotelId={use(params).hotelId} />
    </Suspense>
  );
}

interface HotelDetailPageProps {
  params: Promise<{ hotelId: string }>;
}
