'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useFlightSnapshotDetail } from '@/features/flights/hooks';
import { FlightDetailsView } from '@/components/booking/flight-details-view';
import { OfferExpiryBadge } from '@/components/booking/offer-expiry-badge';

const ease = [0.16, 1, 0.3, 1] as const;

function SnapshotLoadingState() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="text-center"
      >
        <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
        <p className="text-sm font-semibold text-zinc-500">Loading flight details…</p>
      </motion.div>
    </div>
  );
}

function SnapshotErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="text-center max-w-sm"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-zinc-900 mb-2">Unable to load flight</h2>
        <p className="text-sm text-zinc-500 mb-4">{message}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          Try again
        </button>
      </motion.div>
    </div>
  );
}

export default function SnapshotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const snapshotId = params.snapshotId as string;
  const modeParam = searchParams.get('mode');
  const isAgent = modeParam === 'agent';

  const { data, isLoading, error, refetch } = useFlightSnapshotDetail(snapshotId, {
    enabled: !!snapshotId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const agentMarkup = useMemo(() => {
    if (!isAgent || !data) return null;
    const offerId = (data.normalizedOffer as Record<string, unknown>)?.id as string | undefined;
    if (!offerId) return null;
    try {
      const raw = sessionStorage.getItem(`agent_markup_${offerId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [isAgent, data]);

  if (isLoading) {
    return <SnapshotLoadingState />;
  }

  if (error || !data) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'This flight offer may have expired or is no longer available.';
    return <SnapshotErrorState message={errorMessage} onRetry={() => refetch()} />;
  }

  const dv = data.detailView;
  const pricing = data.pricing;

  const goSearch = () => router.push('/flights/search');

  return (
    <>
    {data.expiresAt ? (
      <OfferExpiryBadge expiresAt={data.expiresAt} onExpire={goSearch} />
    ) : (
      // Never silent: if the payload lacks an expiry, say so instead of
      // hiding — a missing badge is indistinguishable from a broken one.
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
        Checking offer time…
      </div>
    )}
    <FlightDetailsView
      offerId={data.offerId}
      from={dv.route?.from?.code ?? ''}
      to={dv.route?.to?.code ?? ''}
      departureAt={dv.journeys?.[0]?.segments?.[0]?.departure?.date ?? ''}
      arrivalAt={dv.journeys?.[dv.journeys.length - 1]?.segments?.[dv.journeys[dv.journeys.length - 1].segments.length - 1]?.arrival?.date ?? ''}
      price={pricing.amount}
      currency={pricing.currency}
      tripType={data.tripType as 'one_way' | 'round_trip' | 'multi_city'}
      adults={1}
      searchKey={data.searchKey ?? ''}
      provider={data.provider}
      snapshotId={snapshotId}
      mode={isAgent ? 'agent' : 'customer'}
      agentOriginalPrice={agentMarkup?.originalPrice}
      agentMarkedUpPrice={agentMarkup?.markedUpPrice}
      agentMarkupPercent={agentMarkup?.markupPercent}
      supplierBase={(pricing as any)?.supplierBase}
      markupAmount={(pricing as any)?.markupAmount}
      fareRules={(data as any).fareRules}
    />
    </>
  );
}
