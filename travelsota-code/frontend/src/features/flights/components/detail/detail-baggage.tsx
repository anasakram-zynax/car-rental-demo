import { useTranslations } from 'next-intl';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';

interface DetailBaggageProps {
  baggage: FlightOfferDetailView['baggage'];
}

export function DetailBaggage({ baggage }: DetailBaggageProps) {
  const t = useTranslations('Checkout');
  if (!baggage) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">Baggage details not available.</p>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Baggage</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {baggage.carryOnLabel ? (
            <div className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700">Carry-on</p>
                <p className="text-xs text-zinc-500">{baggage.carryOnLabel}</p>
              </div>
            </div>
          ) : null}

          {baggage.checkedLabel ? (
            <div className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25 4.5-4.5M3.75 7.5h16.5" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700">Checked</p>
                <p className="text-xs text-zinc-500">{baggage.checkedLabel}</p>
              </div>
            </div>
          ) : null}
        </div>

        {baggage.summaryLabel ? (
          <p className="text-xs text-zinc-500 border-t border-zinc-100 pt-2">{baggage.summaryLabel}</p>
        ) : null}

        {baggage.perSegment && baggage.perSegment.length > 0 ? (
          <div className="border-t border-zinc-100 pt-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Per Segment</p>
            <div className="space-y-1">
              {baggage.perSegment.map((seg) => (
                <div key={seg.segmentIndex} className="flex items-center justify-between text-xs text-zinc-600">
                  <span>Segment {seg.segmentIndex + 1}</span>
                  <span>{seg.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
