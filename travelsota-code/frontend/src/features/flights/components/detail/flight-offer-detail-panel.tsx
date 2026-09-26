'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getOfferDetailView } from '@/features/flights/api/get-offer-detail-view';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { DetailTopSummary } from './detail-top-summary';
import { DetailJourneyTimeline } from './detail-journey-timeline';
import { DetailBaggage } from './detail-baggage';
import { DetailFareRules } from './detail-fare-rules';
import { DetailPricing } from './detail-pricing';
import { DetailPassengerRequirements } from './detail-passenger-requirements';
import { DetailAdminDebug } from './detail-admin-debug';
import { FlightRateComments } from '../flight-rate-comments';

interface FlightOfferDetailPanelProps {
  offerId: string;
  searchKey?: string;
  provider?: string;
  catalogUuid?: string;
  offerData?: Record<string, unknown>;
}

const sectionAnim = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3">
      {children}
    </h2>
  );
}

export function FlightOfferDetailPanel({
  offerId,
  searchKey,
  provider,
  catalogUuid,
  offerData,
}: FlightOfferDetailPanelProps) {
  const t = useTranslations('Checkout');
  const reducedMotion = useReducedMotion();
  const [detail, setDetail] = useState<FlightOfferDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!offerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getOfferDetailView({
      offerId,
      searchKey,
      provider: (provider ?? 'travelport') as 'duffel' | 'travelport' | 'amadeus',
      catalogUuid,
      offerData,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.detailAvailable && res.detailView) {
          setDetail(res.detailView);
          setError(null);
        } else {
          setError(res.message ?? 'Detail view not available.');
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load flight details.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [offerId, searchKey, provider, catalogUuid, offerData]);

  if (loading) {
    return (
      <motion.div
        {...(reducedMotion ? {} : sectionAnim)}
        className="mb-7"
      >
        <SectionHeading>Flight Details</SectionHeading>
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-teal" />
          Loading flight details…
        </div>
      </motion.div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mb-7">
        <SectionHeading>Flight Details</SectionHeading>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          {error ?? 'Detailed fare information unavailable.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Admin debug — only visible to admin/staff */}
      <DetailAdminDebug
        debug={detail.adminDebug}
        provider={detail.provider}
        offerId={detail.offerId}
        searchKey={detail.searchKey}
      />

      <SectionHeading>Flight Details</SectionHeading>

      <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.02 } })}>
        <DetailTopSummary detail={detail} />
      </motion.div>

      <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.06 } })}>
        <SectionHeading>Journey</SectionHeading>
        <DetailJourneyTimeline journeys={detail.journeys} />
      </motion.div>

      <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.1 } })}>
        <SectionHeading>Baggage</SectionHeading>
        <DetailBaggage baggage={detail.baggage} />
      </motion.div>

      <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.14 } })}>
        <SectionHeading>Fare Rules</SectionHeading>
        <DetailFareRules fare={detail.fare} />
      </motion.div>

      <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.16 } })}>
        <FlightRateComments
          data={{
            provider: detail.provider,
            refund: detail.fare?.refundPolicy
              ? {
                  allowed: detail.fare.refundPolicy.allowed,
                  penaltyAmount: detail.fare.refundPolicy.penaltyAmount,
                  penaltyCurrency: detail.fare.refundPolicy.penaltyCurrency,
                  penaltyPercent: detail.fare.refundPolicy.penaltyPercent,
                  free: detail.fare.refundPolicy.free,
                }
              : null,
            change: detail.fare?.changePolicy
              ? {
                  allowed: detail.fare.changePolicy.allowed,
                  penaltyAmount: detail.fare.changePolicy.penaltyAmount,
                  penaltyCurrency: detail.fare.changePolicy.penaltyCurrency,
                  penaltyPercent: detail.fare.changePolicy.penaltyPercent,
                  free: detail.fare.changePolicy.free,
                }
              : null,
            taxAmount: detail.pricing?.taxAmount ?? null,
            taxCurrency: detail.pricing?.currency ?? null,
          }}
        />
      </motion.div>

      <motion.div {...(reducedMotion ? {} : { ...sectionAnim, transition: { ...sectionAnim.transition, delay: 0.18 } })}>
        <SectionHeading>Pricing</SectionHeading>
        <DetailPricing pricing={detail.pricing} />
      </motion.div>

      <DetailPassengerRequirements requirements={detail.passengerRequirements} />
    </div>
  );
}
