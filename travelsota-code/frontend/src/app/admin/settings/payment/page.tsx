'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import PaymentMethodCard from '@/components/admin/settings/PaymentMethodCard';
import {
  getPaymentGateways,
  setGatewayEnabled,
  isManualGatewayKey,
  getBankTransferDetails,
  setBankTransferDetails,
  type BankTransferDetails,
  type PaymentGatewayKey,
  type PaymentGatewaySummary,
} from '@/features/admin/api/admin-settings-payment';
import { useToast } from '@/hooks/useToast';
import { usePermissions } from '@/components/admin/permission/usePermissions';

const PaymentGatewayForm = dynamic(
  () => import('@/components/admin/settings/PaymentGatewayForm'),
  { ssr: false }
);

const GATEWAYS: PaymentGatewayKey[] = ['stripe', 'paypal', 'bank_transfer', 'pay_later'];

const GATEWAY_LABELS: Record<PaymentGatewayKey, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  bank_transfer: 'Bank Transfer',
  pay_later: 'Pay Later',
};

const BANK_FIELDS: Array<{ key: keyof BankTransferDetails; label: string; placeholder: string; required?: boolean }> = [
  { key: 'accountTitle', label: 'Account title', placeholder: 'TravelsOTA Pvt Ltd', required: true },
  { key: 'bankName', label: 'Bank name', placeholder: 'Meezan Bank', required: true },
  { key: 'accountNumber', label: 'Account number', placeholder: '0123-0104567890', required: true },
  { key: 'iban', label: 'IBAN', placeholder: 'PK36MEZN0001230104567890' },
  { key: 'swiftCode', label: 'SWIFT / BIC', placeholder: 'MEZNPKKA' },
];

const DEMO_BANK_DETAILS: BankTransferDetails = {
  accountTitle: 'TravelsOTA Demo Travel Ltd',
  bankName: 'Demo National Bank',
  accountNumber: '0123456789012',
  iban: 'PK36DEMO0000001234567890',
  swiftCode: 'DEMOPKKA',
  instructions:
    'Transfer the exact booking total and quote your booking reference in the payment remarks. Upload your transfer receipt on the next step — your booking is confirmed once our team verifies the payment (usually within 1 business day).',
};

/** Bank account details shown to customers choosing Bank Transfer at checkout. */
function BankDetailsForm() {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BankTransferDetails | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings', 'payment', 'bank-transfer'],
    queryFn: getBankTransferDetails,
    staleTime: 60_000,
  });
  const shown: BankTransferDetails = draft ?? data ?? {};
  const set = (key: keyof BankTransferDetails, value: string) =>
    setDraft((prev) => ({ ...(prev ?? data ?? {}), [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => setBankTransferDetails(shown),
    onSuccess: () => {
      toasts.success('Bank details saved', 'Customers will see them at checkout.');
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'payment'] });
    },
    onError: (err: any) => toasts.error('Save failed', err?.message ?? 'Please try again.'),
  });

  const valid = !!(shown.accountTitle?.trim() && shown.bankName?.trim() && shown.accountNumber?.trim());

  if (isLoading) {
    return <div className="mt-4 h-48 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Customers choosing Bank Transfer see these details at checkout, then upload a receipt.
        The booking waits as held until you verify and issue it.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {BANK_FIELDS.map(({ key, label, placeholder, required }) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs font-semibold text-foreground">
              {label}{required && <span className="text-destructive"> *</span>}
            </span>
            <input
              value={shown[key] ?? ''}
              placeholder={placeholder}
              onChange={(e) => set(key, e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-foreground">Payment instructions</span>
        <textarea
          value={shown.instructions ?? ''}
          placeholder="Transfer the exact total and upload the receipt screenshot here in My Bookings."
          rows={3}
          onChange={(e) => set('instructions', e.target.value)}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
      </label>
      <button
        type="button"
        disabled={!valid || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save bank details'}
      </button>
      <button
        type="button"
        onClick={() => setDraft({ ...DEMO_BANK_DETAILS })}
        className="ml-2 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Fill demo details
      </button>
    </div>
  );
}

function PaymentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gatewayParam = searchParams.get('gateway');
  const gateway = (['stripe', 'paypal', 'bank_transfer', 'pay_later'] as const).includes(gatewayParam as PaymentGatewayKey)
    ? (gatewayParam as PaymentGatewayKey)
    : null;

  const { hasPermission } = usePermissions();
  const toasts = useToast();
  const queryClient = useQueryClient();

  const {
    data: gatewaysList = [],
    isLoading: gatewaysLoading,
    isError: gatewaysError,
    refetch: refetchGateways,
  } = useQuery({
    queryKey: ['admin', 'settings', 'payment'],
    queryFn: getPaymentGateways,
    staleTime: 60_000,
  });

  const { enabledMap, totalActive } = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const item of gatewaysList) map[item.gateway] = item.enabled;
    const active = GATEWAYS.filter((key) => map[key]).length;
    return { enabledMap: map, totalActive: active };
  }, [gatewaysList]);

  const toggleMutation = useMutation<void, Error, { gk: PaymentGatewayKey; enabled: boolean }, { previous: PaymentGatewaySummary[] | undefined }>({
    mutationFn: async ({ gk, enabled }) => {
      await setGatewayEnabled(gk, enabled);
    },
    onMutate: async ({ gk, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'payment'] });
      const previous = queryClient.getQueryData<PaymentGatewaySummary[]>(['admin', 'settings', 'payment']);
      queryClient.setQueryData<PaymentGatewaySummary[]>(['admin', 'settings', 'payment'], (old) =>
        old?.map((g) => (g.gateway === gk ? { ...g, enabled } : g)) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'payment'], context.previous);
      }
      toasts.error('Failed to update gateway', 'Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'payment'] });
    },
    onSuccess: (_data, { gk, enabled }) => {
      const label = GATEWAY_LABELS[gk];
      if (enabled) toasts.success(`${label} enabled`, 'Payment gateway is now active.');
      else toasts.info(`${label} disabled`, 'Payment gateway has been deactivated.');
    },
  });

  if (gateway) {
    const onBackToOverview = () => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('gateway');
      router.push(`?${next.toString()}`, { scroll: false });
    };

    if (!hasPermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)) {
      return (
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <CircleAlert className="mx-auto size-8 text-warning-600" aria-hidden />
          <h2 className="mt-3 text-base font-semibold text-foreground">Payment configuration restricted</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">You have permission to view payment settings, but not to edit gateway credentials.</p>
          <button type="button" onClick={onBackToOverview} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">Back to payment overview</button>
        </div>
      );
    }

    // Manual methods carry no credentials — bank_transfer gets a details form,
    // pay_later gets a behavior explainer.
    if (isManualGatewayKey(gateway)) {
      const label = GATEWAY_LABELS[gateway];
      return (
        <div className="w-full">
          <button type="button" onClick={onBackToOverview} className="mb-4 inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
            Back to payment overview
          </button>
          <div className="max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">{label}</h2>
            {gateway === 'bank_transfer' ? (
              <BankDetailsForm />
            ) : (
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <p>Customers hold a booking without paying. They must complete payment inside the hold window.</p>
                <p>Set the window in General → Bookings (pay-later window). Expired holds auto-cancel.</p>
                <p className="mt-3 text-xs">No credentials needed — enable or disable from the gateway directory.</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full">
        <PaymentGatewayForm gatewayKey={gateway} onBack={onBackToOverview} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <AdminPageHeader
        title="Payment Gateways"
        description="Manage checkout gateways and payment credentials."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Payment' }]}
        actions={
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
            <span className={`size-1.5 rounded-full ${gatewaysError ? 'bg-destructive' : 'bg-emerald-500'}`} aria-hidden />
            {gatewaysError ? 'Status unavailable' : 'Checkout ready'}
            <ArrowUpRight className="size-3" aria-hidden />
          </div>
        }
      />

      {/* Error banner */}
      {gatewaysError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">Payment gateway status could not be loaded</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Your payment configuration is unchanged. Retry to fetch the latest status.</p>
            </div>
          </div>
          <button type="button" onClick={() => void refetchGateways()} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-destructive/25 bg-card px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30">Retry</button>
        </div>
      ) : null}

      {/* Inline summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-muted/20 px-4 py-2.5 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-indigo-500" aria-hidden />
          {GATEWAYS.length} gateway{GATEWAYS.length !== 1 ? 's' : ''} configured
        </span>
        <span className="text-border/70" aria-hidden>|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${totalActive > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden />
          {totalActive} active
        </span>
        <span className="text-border/70" aria-hidden>|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
          {GATEWAYS.length - totalActive} inactive
        </span>
      </div>

      {/* Gateway list */}
      <section aria-labelledby="gateway-directory-heading" className="space-y-2.5">
        <div className="flex items-center gap-2">
          <h2 id="gateway-directory-heading" className="text-sm font-semibold tracking-tight text-foreground">Gateway directory</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{GATEWAYS.length}</span>
        </div>

        {gatewaysLoading ? (
          <div className="space-y-2" aria-label="Loading payment gateways" aria-busy="true">
            {GATEWAYS.map((key) => (
              <div key={key} className="flex h-16 animate-pulse items-center gap-4 rounded-lg border border-border bg-muted/45 px-4" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {GATEWAYS.map((gatewayKey) => (
              <PaymentMethodCard
                key={gatewayKey}
                gatewayKey={gatewayKey}
                enabled={enabledMap[gatewayKey] ?? false}
                onToggle={hasPermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS) && !gatewaysError ? (next) => toggleMutation.mutate({ gk: gatewayKey, enabled: next }) : undefined}
                onSettings={hasPermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS) ? () => {
                  const next = new URLSearchParams(searchParams.toString());
                  next.set('gateway', gatewayKey);
                  router.push(`?${next.toString()}`, { scroll: false });
                } : undefined}
                saving={toggleMutation.isPending && toggleMutation.variables?.gk === gatewayKey}
                statusUnavailable={gatewaysError}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-4 w-52 animate-pulse rounded bg-muted" />
          <div className="flex h-10 animate-pulse items-center gap-4 rounded-lg border border-border bg-muted/20 px-4" />
          <div className="space-y-2">
            {GATEWAYS.map((key) => (
              <div key={key} className="flex h-16 animate-pulse items-center gap-4 rounded-lg border border-border bg-muted/45 px-4" />
            ))}
          </div>
        </div>
      }
    >
      <RequirePagePermission permissions={[PermissionCode.SETTINGS_READ]}>
        <PaymentPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
