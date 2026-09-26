import { useTranslations } from 'next-intl';
import type { PolicyView } from '@/features/flights/types/flight-offer-detail-view';
import { Card } from '@/components/ui/card';

interface DetailFareRulesProps {
  fare: {
    cabin?: string;
    cabinMarketingName?: string;
    fareBrand?: string;
    fareBasisCode?: string;
    classOfService?: string;
    changePolicy?: PolicyView;
    refundPolicy?: PolicyView;
  };
}

function PolicyCard({ policy, type }: { policy?: PolicyView; type: 'Change' | 'Refund' }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        policy?.allowed === true ? 'bg-emerald-100 text-emerald-600' : policy?.allowed === false ? 'bg-red-100 text-red-500' : 'bg-zinc-100 text-zinc-500'
      }`}>
        {type === 'Change' ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-700">{type} Policy</p>
        <p className="text-xs text-zinc-500">
          {policy
            ? policy.allowed === false
              ? `Not allowed · ${policy.label}`
              : policy.label
            : 'Not available'}
        </p>
        {policy?.penaltyAmount && policy.penaltyCurrency ? (
          <p className="text-xs text-amber-600 mt-0.5">
            Fee: {policy.penaltyCurrency} {policy.penaltyAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        ) : policy?.penaltyPercent && policy.penaltyPercent > 0 && policy.penaltyPercent < 100 ? (
          <p className="text-xs text-amber-600 mt-0.5">Fee: {policy.penaltyPercent}% of fare</p>
        ) : null}
      </div>
    </div>
  );
}

export function DetailFareRules({ fare }: DetailFareRulesProps) {
  const t = useTranslations('Checkout');
  return (
    <Card variant="elevated">
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Fare Rules</h3>

        <div className="flex flex-wrap gap-2 text-xs">
          {fare.cabinMarketingName || fare.cabin ? (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-700">
              {fare.cabinMarketingName ?? fare.cabin}
            </span>
          ) : null}
          {fare.fareBrand ? (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-700">
              {fare.fareBrand}
            </span>
          ) : null}
          {fare.fareBasisCode ? (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 font-mono text-zinc-700">
              {fare.fareBasisCode}
            </span>
          ) : null}
          {fare.classOfService ? (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 font-mono text-zinc-700">
              {fare.classOfService}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PolicyCard policy={fare.changePolicy} type="Change" />
          <PolicyCard policy={fare.refundPolicy} type="Refund" />
        </div>
      </div>
    </Card>
  );
}
