import { apiRequest } from "@/lib/api/client";
import { ROUTES } from "@/lib/routes";
import type { PricingBlock } from "@/lib/utils/currency";

export interface HotelDetailsInput {
  searchKey: string;
  hotelId: string;
  /** Hotel group ID for multi-provider orchestration */
  hotelGroupId?: string;
  /** Restrict details fetch to a specific provider */
  provider?: string;
  /** Explicit provider-specific hotel ID (skips mapping/resolution) */
  providerHotelId?: string;
}

export interface HotelDetailsRate {
  rateId: string;
  roomName?: string;
  boardName?: string;
  paymentType?: string;
  supplierAmount: number;
  supplierCurrency: string;
  customerAmount?: number;
  customerCurrency?: string;
  cancellationPolicyText?: string;
  cancellationPolicies?: HotelCancellationPolicy[];
  refundable?: boolean;
  rateKey?: string;
  provider?: string;
  providerHotelId?: string;
}

/**
 * Single-provider response from the backend.
 * Returned when no hotelGroupId is provided.
 */
export interface HotelDetailsResponse {
  provider: string;
  searchKey: string;
  hotelId: string;
  providerHotelId: string;
  name: string;
  images?: string[];
  amenities?: string[];
  description?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  rates: HotelDetailsRate[];
}

export interface DetailImage {
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  category?: string;
  isPrimary?: boolean;
  width?: number;
  height?: number;
  source?: string;
  sortOrder?: number;
}

export interface DetailAmenity {
  code: string;
  name: string;
  category?: string;
  isFree?: boolean;
}

export interface DetailStaticContent {
  status: "full" | "partial" | "missing";
  name: string;
  description?: string;
  images: DetailImage[];
  amenities: DetailAmenity[];
  policies?: Record<string, unknown>;
  address?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

export interface HotelCancellationPolicy {
  amount?: string | number;
  from?: string;
  to?: string;
  deadline?: string;
  policyType?: string;
  percentage?: string | number;
  numberOfNights?: number;
}

export interface EnrichedRate {
  provider: string;
  providerHotelId: string;
  rateId: string;
  roomName: string;
  boardName?: string;
  refundable?: boolean;
  cancellationPolicy?: string;
  cancellationPolicies?: HotelCancellationPolicy[];
  occupancy?: { adults: number; children: number };
  supplierPrice: { amount: number; currency: string };
  customerPrice?: { amount: number; currency: string };
  /** Backend-computed pricing breakdown — use pricing.displayPrice for display */
  pricing?: PricingBlock;
  /** Provider room code from normalizer */
  roomCode?: string;
  /** Stable room key for grouping, e.g. hb:room:DBL or rh:1:2:0:1 */
  roomKey?: string;
  staticRoom?: {
    name: string;
    description?: string;
    images?: DetailImage[];
    amenities?: DetailAmenity[];
    occupancy?: {
      maxAdults?: number;
      maxChildren?: number;
      maxGuests?: number;
    };
    providerRoomId?: string;
  };
  roomMatchStatus?: "matched" | "fallback_name" | "not_attempted";
}

// ── Grouped Room (from backend Phase A) ────────────────────────

/**
 * A room type with its rates grouped underneath.
 * Populated by the backend's groupRatesByRoom() in the enrichment pipeline.
 */
export interface GroupedRoom {
  roomKey: string;
  roomName: string;
  roomInfo: {
    images?: DetailImage[];
    amenities?: DetailAmenity[];
    occupancy?: {
      maxAdults?: number;
      maxChildren?: number;
      maxGuests?: number;
    };
    description?: string;
  };
  fromPrice: { amount: number; currency: string };
  rateCount: number;
  rates: EnrichedRate[];
}

export interface EnrichedProviderSection {
  provider: string;
  providerHotelId: string;
  status: "available" | "unavailable" | "failed";
  rates: EnrichedRate[];
  /** Room-grouped view from backend. Each room is a product with nested rates. */
  rooms: GroupedRoom[];
}

/**
 * Combined multi-provider response from the backend.
 * Returned when hotelGroupId is provided.
 */
export interface CombinedHotelDetailsResponse {
  searchKey: string;
  hotelGroupId: string;
  canonicalHotelId?: string;
  /** Rich static content from the local DB. Prefer over `hotel` for images/amenities/description. */
  content: DetailStaticContent;
  hotel: {
    hotelGroupId: string;
    displayName: string;
    location?: {
      latitude?: number;
      longitude?: number;
      city?: string;
      country?: string;
    };
    starRating?: number;
    images?: string[];
    amenities?: string[];
    description?: string;
    address?: string;
  };
  providerSections: EnrichedProviderSection[];
  warnings?: Array<{ provider: string | null; code: string; message: string }>;
}

/**
 * Convert a combined multi-provider response into the flat HotelDetailsResponse shape
 * that the detail page component expects.
 * Prefers rich `content` block over legacy `hotel` fields.
 */
export function flattenCombinedResponse(
  combined: CombinedHotelDetailsResponse,
): HotelDetailsResponse {
  const firstProvider = combined.providerSections[0];
  const content = combined.content;
  return {
    provider: firstProvider?.provider ?? "combined",
    searchKey: combined.searchKey,
    hotelId: combined.hotelGroupId,
    providerHotelId: firstProvider?.providerHotelId ?? "",
    name: content?.name || combined.hotel.displayName,
    images: content?.images?.length
      ? content.images.map((i) => i.url)
      : combined.hotel.images,
    amenities: content?.amenities?.length
      ? content.amenities.map((a) => a.name)
      : combined.hotel.amenities,
    description: content?.description ?? combined.hotel.description,
    address: content?.address ?? combined.hotel.address,
    rates: combined.providerSections.flatMap((section) =>
      section.rates.map((rate) => ({
        rateId: rate.rateId,
        roomName: rate.roomName,
        boardName: rate.boardName,
        paymentType: section.status === "available" ? "deposit" : undefined,
        supplierAmount: rate.supplierPrice.amount,
        supplierCurrency: rate.supplierPrice.currency,
        customerAmount: rate.customerPrice?.amount,
        customerCurrency: rate.customerPrice?.currency,
        cancellationPolicyText: rate.cancellationPolicy,
        cancellationPolicies: rate.cancellationPolicies,
        refundable: rate.refundable,
        provider: rate.provider,
        providerHotelId: rate.providerHotelId,
      })),
    ),
  };
}

/**
 * Fetch hotel details. Returns either a single-provider response or flattens
 * the combined multi-provider response into the same HotelDetailsResponse shape.
 */
export async function getHotelDetails(
  input: HotelDetailsInput,
): Promise<HotelDetailsResponse> {
  const raw: any = await apiRequest(ROUTES.HOTELS.DETAILS, {
    method: "POST",
    body: input,
  });

  // If response has providerSections, it's the combined format — flatten it
  if (raw.providerSections) {
    return flattenCombinedResponse(raw as CombinedHotelDetailsResponse);
  }

  // Otherwise it's already the flat HotelDetailsResponse format
  return raw as HotelDetailsResponse;
}
