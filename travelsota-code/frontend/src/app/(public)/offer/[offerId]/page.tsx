/**
 * @deprecated Use /flights/offers/[offerId]/details for flights and
 *             /booking/hotels/[rateId]/details for hotels instead.
 */
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/layout/app-shell';
import { OfferPreviewForm } from '@/features/flights/components/offer-preview-form';
import { HotelOfferForm } from '@/features/hotels/components/hotel-offer-form';

function parseProductSelections(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (selection) =>
            selection && typeof selection.offeringId === 'string' && Array.isArray(selection.productIds),
        )
      : undefined;
  } catch {
    return undefined;
  }
}

export default async function OfferDetailPage({
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

  const mod = pick('module') ?? 'flight';
  const mode = pick('mode') ?? 'customer';
  const isHotel = mod === 'hotel' || mod === 'hotels';

  const tCheckout = await getTranslations('Checkout');
  const tCommon = await getTranslations('Common');
  const tNav = await getTranslations('Nav');

  return (
    <AppShell>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
        <Link href="/" className="hover:text-zinc-700 transition">{tCheckout('homeAction')}</Link>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <Link href="/" className="hover:text-zinc-700 transition capitalize">
          {isHotel ? tNav('hotels') : tNav('flights')}
        </Link>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-zinc-600">{tCommon('offerCrumb')}</span>
      </nav>

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {isHotel ? tCommon('offerHotelTitle') : tCheckout('completeFlightBooking')}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {isHotel
            ? tCommon('offerHotelDesc')
            : tCommon('offerFlightDesc')}
        </p>
      </div>

      {isHotel ? (
        <HotelOfferForm
          offerId={offerId}
          hotelName={pick('hotelName')}
          destination={pick('destination')}
          rateKey={pick('rateKey')}
          roomName={pick('roomName')}
          boardName={pick('boardName')}
          price={pick('price')}
          checkIn={pick('checkIn')}
          checkOut={pick('checkOut')}
          roomAdults={pick('room_adults') ?? '1'}
          roomChildren={pick('room_children') ?? '0'}
          mode={mode as 'customer' | 'agent'}
        />
      ) : (
        (() => {
          const productIdsRaw = pick('productIds');
          const productIds = productIdsRaw
            ? productIdsRaw.split(',').map((value) => value.trim()).filter(Boolean)
            : undefined;
          const productSelectionsRaw = pick('productSelections');
          const productSelections = parseProductSelections(productSelectionsRaw);
          const travelerCount = Math.max(Number(pick('adults') ?? '1') || 1, 1);
          const searchKey = pick('searchKey');
          const provider = pick('provider') ?? 'travelport';
          const agentOriginalPrice = pick('agentOriginalPrice');
          const agentMarkedUpPrice = pick('agentMarkedUpPrice');
          const agentMarkupPercent = pick('agentMarkupPercent');

          return (
            <OfferPreviewForm
              offerId={offerId}
              provider={provider}
              from={pick('from')}
              to={pick('to')}
              departureAt={pick('departureAt')}
              arrivalAt={pick('arrivalAt')}
              price={pick('price')}
              currency={pick('currency')}
              productId={pick('productId')}
              productIds={productIds}
              productSelections={productSelections}
              catalogUuid={pick('catalogUuid')}
              offeringIdentifierValue={pick('offeringIdentifierValue')}
              brandOfferingId={pick('brandOfferingId')}
              tripType={pick('tripType') as 'one_way' | 'round_trip' | undefined}
              returnDate={pick('returnDate')}
              travelerCount={travelerCount}
              searchKey={searchKey}
              agentOriginalPrice={agentOriginalPrice ? Number(agentOriginalPrice) : undefined}
              agentMarkedUpPrice={agentMarkedUpPrice ? Number(agentMarkedUpPrice) : undefined}
              agentMarkupPercent={agentMarkupPercent ? Number(agentMarkupPercent) : undefined}
              mode={mode as 'customer' | 'agent'}
            />
          );
        })()
      )}
    </AppShell>
  );
}
