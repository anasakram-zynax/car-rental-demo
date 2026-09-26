import { useTranslations } from 'next-intl';
import type { FlightJourneyDetailView, FlightSegmentDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';

interface DetailJourneyTimelineProps {
  journeys: FlightJourneyDetailView[];
}

export function DetailJourneyTimeline({ journeys }: DetailJourneyTimelineProps) {
  const t = useTranslations('Checkout');
  if (!journeys || journeys.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">Journey details not available.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {journeys.map((journey, ji) => (
        <Card key={ji} variant="elevated">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{journey.label}</h3>
            {journey.durationLabel ? (
              <span className="text-xs text-zinc-500">{journey.durationLabel}</span>
            ) : null}
          </div>
          <div className="relative">
            {journey.segments.map((seg, si) => (
              <SegmentRow key={si} segment={seg} isLast={si === journey.segments.length - 1} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SegmentRow({ segment, isLast }: { segment: FlightSegmentDetailView; isLast: boolean }) {
  const hasLayover = !isLast && segment.layoverAfter;

  return (
    <div className="relative pl-8 pb-3 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-2 bottom-0 w-0.5 bg-zinc-200 last:hidden" style={{ display: isLast ? 'none' : undefined }} />
      <div className="absolute left-[7px] top-2 h-2.5 w-2.5 rounded-full border-2 border-brand-teal bg-white" />

      <div className="flex flex-col gap-1">
        {/* Departure */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-zinc-900 tabular-nums">{segment.departure.time}</span>
          <span className="text-xs text-zinc-500">{segment.departure.date}</span>
          <span className="text-xs font-semibold text-zinc-700">{segment.departure.location.label || segment.departure.location.code}</span>
          {segment.departure.location.terminal ? (
            <span className="text-[10px] text-zinc-400">Terminal {segment.departure.location.terminal}</span>
          ) : null}
        </div>

        {/* Segment detail bar */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 ml-0.5">
          <svg className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" />
          </svg>
          <span>{segment.airlineCode}{segment.flightNumber ? ` ${segment.flightNumber}` : ''}</span>
          <span className="text-zinc-300">·</span>
          <span>{segment.durationLabel ?? '—'}</span>
          {segment.aircraftName ? (
            <><span className="text-zinc-300">·</span><span>{segment.aircraftName}</span></>
          ) : null}
          {segment.cabinMarketingName ? (
            <><span className="text-zinc-300">·</span><span>{segment.cabinMarketingName}</span></>
          ) : null}
        </div>

        {/* Arrival */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-zinc-900 tabular-nums">{segment.arrival.time}</span>
          <span className="text-xs text-zinc-500">{segment.arrival.date}</span>
          <span className="text-xs font-semibold text-zinc-700">{segment.arrival.location.label || segment.arrival.location.code}</span>
          {segment.arrival.location.terminal ? (
            <span className="text-[10px] text-zinc-400">Terminal {segment.arrival.location.terminal}</span>
          ) : null}
        </div>

        {/* Baggage info on segment */}
        {segment.baggageLabel ? (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 ml-0.5 mt-0.5">
            <svg className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <span>{segment.baggageLabel}</span>
          </div>
        ) : null}

        {/* Layover indicator */}
        {hasLayover && segment.layoverAfter ? (
          <div className="ml-[3px] mt-1.5 mb-1.5 flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 border border-amber-200">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>Layover</strong> in {segment.layoverAfter.location.label || segment.layoverAfter.location.code}
              {segment.layoverAfter.durationLabel ? ` · ${segment.layoverAfter.durationLabel}` : ''}
              {segment.layoverAfter.overnight ? ' · Overnight' : ''}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
