import type { FlightOfferView } from '@/lib/schema/flight';

const BRIDGE_KEY = 'travq_offer_bridge';
const TTL_MS = 30 * 60 * 1000; // 30 minutes (offers may expire quickly)

interface OfferBridgeEntry {
  offer: FlightOfferView;
  searchKey: string;
  ts: number;
}

/**
 * Store a flight offer for retrieval on the details page.
 *
 * Call this from the search results page when the user clicks "Book".
 * The details page reads it back to display full offer info without
 * encoding everything in URL query params.
 */
export function storeOffer(offer: FlightOfferView, searchKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: OfferBridgeEntry = { offer, searchKey, ts: Date.now() };
    sessionStorage.setItem(BRIDGE_KEY, JSON.stringify(entry));
    } catch {
      // Quota exceeded — offer data is large, try to store minimal version
      try {
        const minimalOffer = {
          offerId: offer.offerId,
          productId: offer.productId,
          productIds: offer.productIds,
          productSelections: offer.productSelections,
          catalogUuid: offer.catalogUuid,
          offeringIdentifierValue: offer.offeringIdentifierValue,
          brandOfferingId: offer.brandOfferingId,
          price: offer.price,
          segments: offer.segments.map((s) => ({
            from: s.from,
            to: s.to,
            departureAt: s.departureAt,
            arrivalAt: s.arrivalAt,
            marketingCarrier: s.marketingCarrier,
            flightNumber: s.flightNumber,
            display: s.display,
          })),
          cabin: offer.cabin,
          stops: offer.stops,
          brandName: offer.brandName,
          refundable: offer.refundable,
          baggageText: offer.baggageText,
          capabilities: offer.capabilities,
          provider: offer.provider,
          display: offer.display,
        } satisfies Partial<FlightOfferView>;
        const entry = {
          offer: minimalOffer as FlightOfferView,
          searchKey,
          ts: Date.now(),
        };
        sessionStorage.setItem(BRIDGE_KEY, JSON.stringify(entry));
      } catch {
      // Silently fail — the details page will degrade gracefully
    }
  }
}

/**
 * Retrieve the stored flight offer on the details page.
 * Returns null if expired or not found.
 */
export function retrieveOffer(): OfferBridgeEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(BRIDGE_KEY);
    if (!raw) return null;
    const entry: OfferBridgeEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL_MS) {
      sessionStorage.removeItem(BRIDGE_KEY);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Clear the stored offer (call after booking is complete).
 */
export function clearOffer(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(BRIDGE_KEY);
  } catch {
    // Ignore
  }
}
