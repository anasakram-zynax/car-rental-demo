import { useTranslations } from 'next-intl';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DetailTopSummaryProps {
  detail: FlightOfferDetailView;
}

export function DetailTopSummary({ detail }: DetailTopSummaryProps) {
  const t = useTranslations('Checkout');
  const r = detail.route;
  const a = detail.airline;

  return (
    <Card variant="elevated">
      <div className="flex flex-col gap-3">
        {/* Airline + Route */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {a.logoUrl ? (
              <img src={a.logoUrl} alt={a.name ?? a.code ?? ''} className="h-8 w-8 rounded object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500">
                {a.code ?? '?'}
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-zinc-900">{a.name ?? a.code ?? 'Airline'}</p>
              {a.operatingAirlineName && a.operatingAirlineName !== a.name ? (
                <p className="text-xs text-zinc-500">Operated by {a.operatingAirlineName}</p>
              ) : null}
            </div>
          </div>
          <Badge variant="info">{r.tripType.replace('_', ' ')}</Badge>
        </div>

        {/* Route string */}
        <div className="flex items-center gap-2 text-lg font-bold text-zinc-900">
          <span>{r.from.label || r.from.code}</span>
          <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
          </svg>
          <span>{r.to.label || r.to.code}</span>
        </div>

        {/* Location details */}
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">From</p>
            <p>{r.from.cityName ? `${r.from.cityName} (${r.from.code})` : r.from.code}</p>
            {r.from.airportName ? <p className="text-zinc-400">{r.from.airportName}</p> : null}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">To</p>
            <p>{r.to.cityName ? `${r.to.cityName} (${r.to.code})` : r.to.code}</p>
            {r.to.airportName ? <p className="text-zinc-400">{r.to.airportName}</p> : null}
          </div>
        </div>

        {/* Duration + stops */}
        <div className="flex items-center gap-3 text-xs text-zinc-600 border-t border-zinc-100 pt-3">
          {r.totalDurationLabel ? (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {r.totalDurationLabel}
            </span>
          ) : null}
          {r.stopsLabel ? (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
              {r.stopsLabel}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
