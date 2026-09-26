import { useTranslations } from 'next-intl';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';

interface DetailPassengerRequirementsProps {
  requirements: FlightOfferDetailView['passengerRequirements'];
}

export function DetailPassengerRequirements({ requirements }: DetailPassengerRequirementsProps) {
  const t = useTranslations('Checkout');
  if (!requirements) return null;

  return (
    <Card variant="elevated">
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Passenger Requirements</h3>

        {requirements.identityDocumentsRequired ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
            </svg>
            Identity documents required for this booking
          </div>
        ) : null}

        {requirements.supportedIdentityDocumentTypes &&
          requirements.supportedIdentityDocumentTypes.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Accepted Documents</p>
            <div className="flex flex-wrap gap-1.5">
              {requirements.supportedIdentityDocumentTypes.map((doc) => (
                <span key={doc} className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700">
                  {doc.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {requirements.supportedLoyaltyProgrammes &&
          requirements.supportedLoyaltyProgrammes.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Loyalty Programmes</p>
            <div className="flex flex-wrap gap-1.5">
              {requirements.supportedLoyaltyProgrammes.map((prog) => (
                <span key={prog} className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-700">
                  {prog}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
