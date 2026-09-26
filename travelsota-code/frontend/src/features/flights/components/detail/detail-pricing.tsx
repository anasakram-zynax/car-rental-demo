import { useTranslations } from 'next-intl';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';

interface DetailPricingProps {
  pricing: FlightOfferDetailView['pricing'];
}

const FMT = (n: number | undefined | null) =>
  n != null ? n.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—';

export function DetailPricing({ pricing }: DetailPricingProps) {
  const t = useTranslations('Checkout');
  if (!pricing) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">Pricing details not available.</p>
      </Card>
    );
  }

  const ccy = pricing.displayCurrency ?? pricing.currency;

  return (
    <Card variant="elevated">
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Price Breakdown</h3>

        <div className="space-y-1.5 text-sm">
          {pricing.baseAmount != null ? (
            <div className="flex justify-between">
              <span className="text-zinc-600">Base Fare</span>
              <span className="font-medium text-zinc-800">{ccy} {FMT(pricing.baseAmount)}</span>
            </div>
          ) : null}

          {pricing.taxAmount != null ? (
            <div className="flex justify-between">
              <span className="text-zinc-600">Taxes</span>
              <span className="font-medium text-zinc-800">{ccy} {FMT(pricing.taxAmount)}</span>
            </div>
          ) : null}

          {pricing.feesAmount != null ? (
            <div className="flex justify-between">
              <span className="text-zinc-600">Fees</span>
              <span className="font-medium text-zinc-800">{ccy} {FMT(pricing.feesAmount)}</span>
            </div>
          ) : null}

          {pricing.supplierTotal != null ? (
            <div className="flex justify-between">
              <span className="text-zinc-600">Supplier Total</span>
              <span className="font-medium text-zinc-800">{ccy} {FMT(pricing.supplierTotal)}</span>
            </div>
          ) : null}

          <div className="flex justify-between border-t border-zinc-100 pt-1.5 mt-1.5">
            <span className="font-bold text-zinc-900">Customer Total</span>
            <span className="font-bold text-zinc-900 text-base">
              {ccy} {FMT(pricing.customerTotal ?? pricing.supplierTotal)}
            </span>
          </div>
        </div>

        {/* Timestamps */}
        <div className="border-t border-zinc-100 pt-2 space-y-1 text-[11px] text-zinc-400">
          {pricing.priceLastCheckedAt ? (
            <p>Last checked: {new Date(pricing.priceLastCheckedAt).toLocaleString()}</p>
          ) : null}
          {pricing.offerExpiresAt ? (
            <p>Offer expires: {new Date(pricing.offerExpiresAt).toLocaleString()}</p>
          ) : null}
          {pricing.priceGuaranteeExpiresAt ? (
            <p>Price guarantee expires: {new Date(pricing.priceGuaranteeExpiresAt).toLocaleString()}</p>
          ) : null}
          {pricing.paymentRequiredBy ? (
            <p>Payment required by: {new Date(pricing.paymentRequiredBy).toLocaleString()}</p>
          ) : null}
          {pricing.priceChanged ? (
            <p className="text-amber-600 font-medium">Price has changed since search</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
