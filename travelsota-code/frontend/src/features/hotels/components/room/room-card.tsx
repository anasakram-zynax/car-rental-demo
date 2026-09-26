"use client";
import { useTranslations } from 'next-intl';


import { motion } from "motion/react";
import { useCurrency } from "@/context/CurrencyContext";
import { SafeHotelImage } from "@/components/ui/safe-hotel-image";
import { upgradeHotelbedsImage } from "@/lib/utils/hotel-image-url";
import { amenityLabel } from "@/lib/utils/amenity-utils";
import { RateList } from "./rate-list";
import type { GroupedRoom } from "../../api/get-hotel-details";

// ponytail: amenity label helper — friendly name first, then mapped label,
// then pretty-printed code (BUFFET_BREAKFAST → Buffet Breakfast).
function displayAmenityName(a: { code: string; name?: string }): string {
  return a.name || amenityLabel(a.code);
}

interface RoomCardProps {
  room: GroupedRoom;
  selectedRateKey: string | null;
  nights: number;
  onSelect: (rateId: string) => void;
  occupancyBadge?: "exact" | "larger" | "insufficient";
  requestedGuests?: number;
  /** Hotel gallery images used as fallback when a room has no photos. */
  galleryImages?: string[];
}

/** Deterministic hash so each room gets its own (stable) gallery image. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function RoomCard({
  room,
  selectedRateKey,
  nights,
  onSelect,
  occupancyBadge,
  requestedGuests,
  galleryImages = [],
}: RoomCardProps) {
  const t = useTranslations('Checkout');
  const { formatPrice } = useCurrency();

  // Room image first; when missing, pick a stable gallery photo so the card
  // never looks empty (different rooms get different images).
  const fallbackImage =
    galleryImages.length > 0
      ? galleryImages[hashString(room.roomKey) % galleryImages.length]
      : undefined;
  const thumbnail =
    upgradeHotelbedsImage(room.roomInfo.images?.[0]?.url) || fallbackImage || undefined;
  const sleeps = room.roomInfo.occupancy?.maxGuests;
  const amenities = (room.roomInfo.amenities ?? []).slice(0, 5);

  const capacityNote =
    occupancyBadge === "larger" && sleeps != null && requestedGuests != null && sleeps > requestedGuests
      ? `Fits up to ${sleeps} guests`
      : occupancyBadge === "insufficient" && sleeps != null
        ? `Fits up to ${sleeps} guests`
        : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-brand-teal/10 bg-white shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-white/8 dark:bg-gray-900"
    >
      {/* Room header: thumbnail + name + sleeps + from-price */}
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <div className="hidden h-20 w-24 shrink-0 overflow-hidden rounded-xl sm:block">
          {thumbnail ? (
            <SafeHotelImage
              src={thumbnail}
              alt={room.roomName || "Room"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.4} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-charcoal dark:text-white">
            {room.roomName || "Standard Room"}
          </h3>
          {room.roomInfo.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-[#7d7d7d] dark:text-gray-500">
              {room.roomInfo.description}
            </p>
          )}
          {sleeps ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#7d7d7d] dark:text-gray-500">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.6}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                />
              </svg>
              Sleeps {sleeps}
            </p>
          ) : null}
          {capacityNote ? (
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              {capacityNote}
            </p>
          ) : null}

          {/* Amenity chips */}
          {amenities.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <span
                  key={a.code}
                  className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-[#545454] dark:bg-white/8 dark:text-gray-400"
                >
                  {displayAmenityName(a)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* From-price — fromPrice is a STAY total; show per-night here and
            the total beneath so the header can't misquote a 3-night total
            as the nightly rate. */}
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-[#7d7d7d] dark:text-gray-500">
            From
          </p>
          <p className="text-xl font-black tabular-nums text-brand-teal dark:text-white">
            {formatPrice(nights > 1 ? room.fromPrice.amount / nights : room.fromPrice.amount, room.fromPrice.currency)}
          </p>
          <p className="text-[11px] text-[#7d7d7d] dark:text-gray-500">
            / night
          </p>
          {nights > 1 && (
            <p className="text-[11px] font-medium text-[#545454] dark:text-gray-400">
              {formatPrice(room.fromPrice.amount, room.fromPrice.currency)} total
            </p>
          )}
        </div>
      </div>

      {/* Rate list */}
      <div className="border-t border-brand-teal/5 dark:border-white/5">
        <RateList
          rates={room.rates}
          selectedRateKey={selectedRateKey}
          nights={nights}
          onSelect={onSelect}
        />
      </div>
    </motion.div>
  );
}
