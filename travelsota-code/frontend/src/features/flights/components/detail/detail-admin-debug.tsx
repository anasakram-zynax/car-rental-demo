'use client';

import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

interface DetailAdminDebugProps {
  debug?: FlightOfferDetailView['adminDebug'];
  provider?: string;
  offerId?: string;
  searchKey?: string;
}

export function DetailAdminDebug({ debug, provider, offerId, searchKey }: DetailAdminDebugProps) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  if (!isAdmin) return null;

  return (
    <Card variant="bordered" className="border-amber-300/50">
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-[0.2em]">
            Admin / Staff Debug
          </h3>
          <svg
            className={`h-3.5 w-3.5 text-amber-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {open ? (
          <div className="space-y-1.5 text-xs font-mono text-zinc-600 bg-zinc-50 rounded-lg p-3 overflow-x-auto">
            {offerId ? <Row label="Offer ID" value={offerId} /> : null}
            {provider ? <Row label="Provider" value={provider} /> : null}
            {searchKey ? <Row label="Search Key" value={searchKey} /> : null}
            {debug?.contentSource ? <Row label="Content Source" value={debug.contentSource} /> : null}
            {debug?.offeringId ? <Row label="Offering ID" value={debug.offeringId} /> : null}
            {debug?.catalogUuid ? <Row label="Catalog UUID" value={debug.catalogUuid} /> : null}
            {debug?.fareBasisCode ? <Row label="Fare Basis Code" value={debug.fareBasisCode} /> : null}
            {debug?.classOfService ? <Row label="Class of Service" value={debug.classOfService} /> : null}
            {debug?.productIds && debug.productIds.length > 0 ? (
              <div className="flex gap-2">
                <span className="text-amber-600 shrink-0">Product IDs:</span>
                <span>{debug.productIds.join(', ')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-amber-600 shrink-0">{label}:</span>
      <span className="break-all">{value}</span>
    </div>
  );
}
