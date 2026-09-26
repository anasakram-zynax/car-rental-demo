'use client';

import { useTranslations } from 'next-intl';
import type { FlightOfferView } from '@/lib/schema/flight';

interface FlightItineraryCardProps {
  segments: FlightOfferView['segments'];
  from: string;
  to: string;
  tripType?: string;
  returnDate?: string;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return iso; }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function fmtDuration(dep: string, arr: string): string {
  try {
    const diff = new Date(arr).getTime() - new Date(dep).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  } catch { return ''; }
}

function AirlineLogo({ url, name }: { url?: string; name?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? 'Airline'}
        className="h-8 w-8 object-contain"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const initials = (name ?? '—').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] font-bold text-zinc-500">
      {initials}
    </div>
  );
}

function SegmentRow({ segment, isLast }: { segment: NonNullable<FlightOfferView['segments']>[number]; isLast: boolean }) {
  const tCheckout = useTranslations('Checkout');
  const d = segment.display;
  const dep = segment.departureAt;
  const arr = segment.arrivalAt;
  const stops = 0; // individual segment = single leg

  return (
    <div className="relative flex gap-4">
      {/* Timeline */}
      <div className="flex flex-col items-center pt-0.5">
        <div className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-zinc-900 bg-white" />
        {!isLast && <div className="w-px flex-1 bg-zinc-200 my-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-5">
        {/* Departure */}
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-zinc-900 tabular-nums">{fmtTime(dep)}</span>
          <span className="text-sm font-medium text-zinc-700">{d?.origin?.label ?? segment.from}</span>
          {d?.origin?.terminal && (
            <span className="text-[10px] text-zinc-400">T{d.origin.terminal}</span>
          )}
        </div>

        {/* Route bar */}
        <div className="my-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-zinc-200" />
          <svg className="h-3 w-3 shrink-0 text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
          </svg>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        {/* Arrival */}
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-zinc-900 tabular-nums">{fmtTime(arr)}</span>
          <span className="text-sm font-medium text-zinc-700">{d?.destination?.label ?? segment.to}</span>
          {d?.destination?.terminal && (
            <span className="text-[10px] text-zinc-400">T{d.destination.terminal}</span>
          )}
        </div>

        {/* Segment meta */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          {d?.durationLabel && <span>{d.durationLabel}</span>}
          {!d?.durationLabel && dep && arr && <span>{fmtDuration(dep, arr)}</span>}
          {stops === 0 && <span>{tCheckout('nonstop')}</span>}
          {d?.cabinLabel && <span>{d.cabinLabel}</span>}
          {d?.baggageLabel && (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25zM10.5 2.25H7.5a2.25 2.25 0 00-2.25 2.25v1.5h7.5v-1.5a2.25 2.25 0 00-2.25-2.25z" />
              </svg>
              {d.baggageLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SegmentGroup({ label, segments }: { label: string; segments: NonNullable<FlightOfferView['segments']> }) {
  const tCheckout = useTranslations('Checkout');
  if (!segments.length) return null;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const stops = segments.length - 1;
  const d = first.display;
  const airlineName = d?.airlineName ?? first.marketingCarrier;
  const airlineLogo = d?.airlineLogoUrl;

  return (
    <div className="border border-zinc-200 bg-white p-4">
      {/* Group header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{label}</span>
        <span className="text-[11px] text-zinc-500">{fmtDate(first.departureAt)}</span>
      </div>

      {/* Airline */}
      {airlineName && (
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-zinc-100">
          <AirlineLogo url={airlineLogo} name={airlineName} />
          <div>
            <p className="text-sm font-medium text-zinc-900">{airlineName}</p>
            {d?.flightNumber && <p className="text-[11px] text-zinc-500">{d.flightNumber}</p>}
          </div>
          {stops > 0 && (
            <span className="ml-auto text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-2 py-0.5 ring-1 ring-amber-200/60">
              {tCheckout('stopsCount', { count: stops })}
            </span>
          )}
        </div>
      )}

      {/* Segments */}
      {segments.map((seg, i) => (
        <SegmentRow key={i} segment={seg} isLast={i === segments.length - 1} />
      ))}
    </div>
  );
}

/**
 * Flight itinerary card — clean airline + segment visualization.
 * Supports round-trip with outbound/return segment groups.
 */
export function FlightItineraryCard({ segments, from, to, tripType, returnDate }: FlightItineraryCardProps) {
  const tFlights = useTranslations('Flights');
  if (!segments || segments.length === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-500">{tFlights('itineraryUnavailable')}</p>
      </div>
    );
  }

  const isRoundTrip = tripType === 'round_trip';
  const outbound = segments;
  const hasReturn = isRoundTrip && returnDate;

  return (
    <div className="space-y-3">
      {/* Outbound */}
      <SegmentGroup label={tFlights('outbound')} segments={outbound} />

      {/* Return placeholder */}
      {hasReturn && (
        <div className="border border-dashed border-zinc-300 bg-zinc-50/50 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{tFlights('inbound')}</span>
            <span className="text-[11px] text-zinc-500">{fmtDate(returnDate)}</span>
          </div>
          <p className="text-sm text-zinc-500">{to} → {from}</p>
        </div>
      )}
    </div>
  );
}
