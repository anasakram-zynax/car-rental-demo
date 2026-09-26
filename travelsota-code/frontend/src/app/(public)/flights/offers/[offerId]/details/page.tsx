import type { Metadata } from 'next';
import { FlightDetailsPageClient } from './client';

export const metadata: Metadata = {
  title: 'Flight Details — TravelsOTA',
  description: 'Review your flight details and enter traveler information.',
};

export default async function FlightOfferDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ offerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { offerId } = await params;
  const query = await searchParams;

  const pick = (key: string) => {
    const val = query[key];
    return Array.isArray(val) ? val[0] : val;
  };

  const from = pick('from') ?? '';
  const to = pick('to') ?? '';
  const departureAt = pick('departureAt') ?? '';
  const arrivalAt = pick('arrivalAt') ?? '';
  const price = Number(pick('price') ?? '0');
  const currency = pick('currency') ?? 'USD';
  const productId = pick('productId');
  const catalogUuid = pick('catalogUuid');
  const offeringIdentifierValue = pick('offeringIdentifierValue');
  const brandOfferingId = pick('brandOfferingId');
  const tripType = pick('tripType') as 'one_way' | 'round_trip' | undefined;
  const returnDate = pick('returnDate');
  const adults = Math.max(Number(pick('adults') ?? '1') || 1, 1);
  const searchKey = pick('searchKey');
  const provider = pick('provider') ?? 'travelport';

  const productIdsRaw = pick('productIds');
  const productIds = productIdsRaw
    ? productIdsRaw.split(',').map((v) => v.trim()).filter(Boolean)
    : undefined;

  let productSelections: Array<{ offeringId: string; productIds: string[] }> | undefined;
  const productSelectionsRaw = pick('productSelections');
  if (productSelectionsRaw) {
    try {
      const parsed = JSON.parse(productSelectionsRaw);
      if (Array.isArray(parsed)) {
        productSelections = parsed.filter(
          (s: any) => s && typeof s.offeringId === 'string' && Array.isArray(s.productIds),
        );
      }
    } catch {
      /* ignore parse errors */
    }
  }

  const mode = pick('mode') ?? 'customer';
  const agentOriginalPrice = pick('agentOriginalPrice');
  const agentMarkedUpPrice = pick('agentMarkedUpPrice');
  const agentMarkupPercent = pick('agentMarkupPercent');
  const baggageLabel = pick('baggageLabel');

  // Return-leg metadata for round-trip bookings
  const returnOfferId = pick('returnOfferId');
  const returnProductId = pick('returnProductId');
  const returnProductIdsRaw = pick('returnProductIds');
  const returnProductIds = returnProductIdsRaw
    ? returnProductIdsRaw.split(',').map((v) => v.trim()).filter(Boolean)
    : undefined;
  const returnCatalogUuid = pick('returnCatalogUuid');
  let returnProductSelections: Array<{ offeringId: string; productIds: string[] }> | undefined;
  const returnProductSelectionsRaw = pick('returnProductSelections');
  if (returnProductSelectionsRaw) {
    try {
      const parsed = JSON.parse(returnProductSelectionsRaw);
      if (Array.isArray(parsed)) {
        returnProductSelections = parsed.filter(
          (s: any) => s && typeof s.offeringId === 'string' && Array.isArray(s.productIds),
        );
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return (
    <FlightDetailsPageClient
      offerId={offerId}
      from={from}
      to={to}
      departureAt={departureAt}
      arrivalAt={arrivalAt}
      price={price}
      currency={currency}
      productId={productId}
      productIds={productIds}
      productSelections={productSelections}
      catalogUuid={catalogUuid}
      offeringIdentifierValue={offeringIdentifierValue}
      brandOfferingId={brandOfferingId}
      tripType={tripType}
      returnDate={returnDate}
      adults={adults}
      searchKey={searchKey}
      provider={provider}
      agentOriginalPrice={agentOriginalPrice ? Number(agentOriginalPrice) : undefined}
      agentMarkedUpPrice={agentMarkedUpPrice ? Number(agentMarkedUpPrice) : undefined}
      agentMarkupPercent={agentMarkupPercent ? Number(agentMarkupPercent) : undefined}
      mode={mode as 'customer' | 'agent'}
      returnOfferId={returnOfferId}
      returnProductId={returnProductId}
      returnProductIds={returnProductIds}
      returnCatalogUuid={returnCatalogUuid}
      returnProductSelections={returnProductSelections}
      baggageLabel={baggageLabel}
    />
  );
}
