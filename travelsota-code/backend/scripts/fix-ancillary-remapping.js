const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src/modules/flights/application/services/travelport-booking-workflow.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix #1: Replace the remapSeatsFromFreshOptions method
const oldSeatsFunc = `  private remapSeatsFromFreshOptions<T extends { seatNumber: string; catalogOfferingsIdentifier?: string; catalogOfferingIdentifierValue?: string }>(
    selectedSeats: T[],
    freshOptions: AncillaryCatalogOption[],
  ): T[] {
    if (freshOptions.length === 0) return selectedSeats;

    return selectedSeats.map((seat) => {
      const match = freshOptions.find(
        (opt) => opt.supplier.seatAssignment === seat.seatNumber,
      );
      if (match?.supplier) {
        return {
          ...seat,
          catalogOfferingsIdentifier: match.supplier.catalogOfferingsIdIdentifier ?? seat.catalogOfferingsIdentifier,
          catalogOfferingIdentifierValue: match.supplier.catalogOfferingIdentifierValue ?? seat.catalogOfferingIdentifierValue,
        };
      }
      return seat;
    });
  }

  /**
   * Phase 6 — Remap selected baggage/services to fresh options from re-shop.
   * Matches by ancillaryProductId. Returns remapped selections with fresh
   * identifiers or the originals if no match found.
   */
  private remapAncillariesFromFreshOptions<T extends { ancillaryProductId: string; catalogOfferingsIdentifier?: string; catalogOfferingIdentifier?: string }>(
    selected: T[],
    freshOptions: AncillaryCatalogOption[],
  ): T[] {
    if (freshOptions.length === 0) return selected;

    return selected.map((item) => {
      const match = freshOptions.find(
        (opt) => opt.supplier.productIdentifier === item.ancillaryProductId,
      );
      if (match?.supplier) {
        return {
          ...item,
          catalogOfferingsIdentifier: match.supplier.catalogOfferingsIdentifier ?? item.catalogOfferingsIdentifier,
          catalogOfferingIdentifier: match.supplier.catalogOfferingIdentifier ?? item.catalogOfferingIdentifier,
        };
      }
      return item;
    });
  }`;

const newSeatsFunc = `  private remapSeatsFromFreshOptions<T extends { seatNumber: string; price?: { amount: number; currency: string }; catalogOfferingsIdentifier?: string; catalogOfferingIdentifierValue?: string }>(
    selectedSeats: T[],
    freshOptions: AncillaryCatalogOption[],
  ): T[] {
    if (freshOptions.length === 0) return selectedSeats;

    return selectedSeats.map((seat) => {
      // Primary match: exact seat number
      let match = freshOptions.find(
        (opt) => opt.supplier.seatAssignment === seat.seatNumber,
      );

      // Fallback: match by price tolerance (within 5%) when exact seat unavailable
      if (!match && seat.price?.amount) {
        const priceTolerance = seat.price.amount * 0.05;
        match = freshOptions.find(
          (opt) =>
            opt.type === 'seat' &&
            Math.abs(opt.price.amount - seat.price.amount) <= priceTolerance,
        );
      }

      if (match?.supplier) {
        return {
          ...seat,
          catalogOfferingsIdentifier: match.supplier.catalogOfferingsIdIdentifier ?? match.supplier.catalogOfferingsIdentifier ?? seat.catalogOfferingsIdentifier,
          catalogOfferingIdentifierValue: match.supplier.catalogOfferingIdentifierValue ?? seat.catalogOfferingIdentifierValue,
        };
      }
      return seat;
    });
  }

  /**
   * Phase 6 — Remap selected baggage/services to fresh options from re-shop.
   * Matches by semantic meaning (type + price tolerance) rather than product ID only.
   * Uses multiple matching strategies in priority order:
   * 1. Exact product identifier match
   * 2. Type + price tolerance (within 5%)
   * 3. Type + label similarity
   * Falls back to originals if no match found.
   */
  private remapAncillariesFromFreshOptions<T extends { ancillaryProductId: string; type?: string; price?: { amount: number; currency: string }; label?: string; catalogOfferingsIdentifier?: string; catalogOfferingIdentifier?: string }>(
    selected: T[],
    freshOptions: AncillaryCatalogOption[],
  ): T[] {
    if (freshOptions.length === 0) return selected;

    return selected.map((item) => {
      // Strategy 1: Exact product identifier match
      let match = freshOptions.find(
        (opt) => opt.supplier.productIdentifier === item.ancillaryProductId,
      );

      // Strategy 2: Type + price tolerance match (within 5%)
      if (!match && item.price?.amount && item.type) {
        const priceTolerance = item.price.amount * 0.05;
        match = freshOptions.find(
          (opt) =>
            opt.type === item.type &&
            Math.abs(opt.price.amount - item.price.amount) <= priceTolerance,
        );
      }

      // Strategy 3: Type + label similarity
      if (!match && item.label && item.type) {
        const normalizedLabel = item.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        match = freshOptions.find(
          (opt) =>
            opt.type === item.type &&
            opt.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedLabel.slice(0, 10)),
        );
      }

      if (match?.supplier) {
        return {
          ...item,
          catalogOfferingsIdentifier: match.supplier.catalogOfferingsIdentifier ?? item.catalogOfferingsIdentifier,
          catalogOfferingIdentifier: match.supplier.catalogOfferingIdentifier ?? item.catalogOfferingIdentifier,
          ancillaryProductId: match.supplier.productIdentifier ?? item.ancillaryProductId,
        };
      }
      return item;
    });
  }`;

if (content.includes(oldSeatsFunc)) {
  content = content.replace(oldSeatsFunc, newSeatsFunc);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: Replaced both remapping functions');
} else {
  console.log('FAIL: Could not find the exact old function text in the file');
  // Try to find the start of the seats function
  const seatsIdx = content.indexOf('private remapSeatsFromFreshOptions');
  const ancIdx = content.indexOf('private remapAncillariesFromFreshOptions');
  const cashIdx = content.indexOf('private buildCashFopBody');
  console.log(`remapSeatsFromFreshOptions found at index: ${seatsIdx}`);
  console.log(`remapAncillariesFromFreshOptions found at index: ${ancIdx}`);
  console.log(`buildCashFopBody found at index: ${cashIdx}`);
}
