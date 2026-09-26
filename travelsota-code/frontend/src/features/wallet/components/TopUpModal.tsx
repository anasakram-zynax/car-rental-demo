'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import {
  topUpWallet,
  requestTopup,
  uploadAgentTopupEvidence,
  type TopupRequest,
} from '@/features/wallet/api/agent-wallet';
import {
  topUpCustomerWallet,
  requestCustomerTopup,
  uploadCustomerTopupEvidence,
  type CustomerTopupRequest,
} from '@/features/wallet/api/customer-wallet';
import { getEnabledGateways } from '@/features/payments/api/get-gateway-config';
import { StripePaymentForm } from '@/components/payment/stripe-payment-form';
import { PayPalPaymentButton } from '@/components/payment/paypal-payment-button';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'agent' | 'customer';
  walletCurrency?: string;
  onSuccess?: () => void;
}

type PayMethod = 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later';

interface OnlineIntent {
  paymentId: string;
  bookingId?: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export function TopUpModal({ open, onClose, mode, walletCurrency = 'USD', onSuccess }: TopUpModalProps) {
  const queryClient = useQueryClient();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  const [amount, setAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('stripe');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [intent, setIntent] = useState<OnlineIntent | null>(null);

  const scope = mode === 'agent' ? 'agent' : 'customer';
  const fmt = (n: number, currency: string = walletCurrency) => formatCurrencyWithCode(n, currency, decimalsMap);
  const parsedAmount = parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isOnline = payMethod === 'stripe' || payMethod === 'paypal';
  const paypalContainerId = `paypal-topup-${mode}`;

  const { data: gateways } = useQuery({
    queryKey: ['payments', 'gateways'],
    queryFn: getEnabledGateways,
    enabled: open,
    staleTime: 60_000,
  });
  // ponytail: show online options while loading; hide only when explicitly disabled
  const stripeEnabled = gateways ? (gateways.find((g) => g.gateway === 'stripe')?.enabled ?? true) : true;
  const paypalEnabled = gateways ? (gateways.find((g) => g.gateway === 'paypal')?.enabled ?? true) : true;

  // Reset transient state on open; fall back to an available method once gateways load
  useEffect(() => {
    if (open) {
      setIntent(null);
      setReference('');
      setFile(null);
      setPreviewUrl(null);
      setEvidenceUrl(null);
    }
  }, [open ]);
  useEffect(() => {
    if (!gateways || !open) return;
    if (payMethod === 'stripe' && !stripeEnabled) {
      setPayMethod(paypalEnabled ? 'paypal' : 'bank_transfer');
    } else if (payMethod === 'paypal' && !paypalEnabled) {
      setPayMethod(stripeEnabled ? 'stripe' : 'bank_transfer');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateways, open]);

  // Revoke object URL on unmount / replace
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleClose() {
    setIntent(null);
    onClose();
  }

  function handleOnlineSuccess() {
    queryClient.invalidateQueries({ queryKey: [scope, 'wallet'] });
    toasts.success('Top-up successful', 'Your wallet has been credited.');
    onSuccess?.();
    handleClose();
  }

  const createIntent = useMutation({
    mutationFn: ({ amt, gateway }: { amt: number; gateway: 'STRIPE' | 'PAYPAL' }) =>
      mode === 'agent'
        ? topUpWallet(amt, 'Wallet top-up', gateway)
        : topUpCustomerWallet(amt, 'Wallet top-up', gateway),
    onSuccess: (res) => setIntent(res),
    onError: () => toasts.error('Top-up failed', 'Could not start payment. Please try again.'),
  });

  const offlineMutation = useMutation<
    TopupRequest | CustomerTopupRequest,
    Error,
    { amt: number; method: string; ref: string; evUrl?: string }
  >({
    mutationFn: ({ amt, method, ref, evUrl }: { amt: number; method: string; ref: string; evUrl?: string }) =>
      mode === 'agent'
        ? requestTopup(amt, method, ref, { currency: walletCurrency, evidenceUrl: evUrl })
        : requestCustomerTopup(amt, method, ref, { currency: walletCurrency, evidenceUrl: evUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [scope, 'wallet', 'topup-requests'] });
      toasts.success('Request sent', 'Admin will review and credit your wallet on approval.');
      onSuccess?.();
      handleClose();
    },
    onError: () => toasts.error('Request failed', 'Could not submit top-up request. Please try again.'),
  });

  async function handleFileSelect(selected: File | undefined) {
    if (!selected) return;
    const okType = selected.type.startsWith('image/') || selected.type === 'application/pdf';
    if (!okType) {
      toasts.error('Invalid file', 'Receipt must be an image or PDF.');
      return;
    }
    if (selected.size > MAX_EVIDENCE_BYTES) {
      toasts.error('File too large', 'Receipt must be 5MB or smaller.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(selected.type.startsWith('image/') ? URL.createObjectURL(selected) : null);
    setUploading(true);
    try {
      const url =
        mode === 'agent' ? await uploadAgentTopupEvidence(selected) : await uploadCustomerTopupEvidence(selected);
      setEvidenceUrl(url);
    } catch (err) {
      setFile(null);
      setPreviewUrl(null);
      toasts.error('Upload failed', err instanceof Error ? err.message : 'Could not upload receipt.');
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setEvidenceUrl(null);
  }

  if (!open) return null;

  const methodCard = (id: PayMethod, title: string, subtitle: string, badge: string, badgeCls: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setPayMethod(id);
        setIntent(null);
      }}
      className={`cursor-pointer rounded-xl border p-3 text-left transition-all ${
        payMethod === id
          ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200 dark:border-brand-600 dark:bg-brand-900/20'
          : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
      }`}
    >
      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>{badge}</span>
      <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Funds</h3>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Card and PayPal payments credit instantly. Bank transfers need a receipt and admin approval. Pay later needs approval only — no receipt.
        </p>

        {/* Amount */}
        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount ({walletCurrency})</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amount}
            disabled={intent !== null}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-lg font-semibold text-gray-900 placeholder-gray-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
          <div className="mt-3 flex gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setAmount(String(amt));
                  setIntent(null);
                }}
                className={`flex-1 cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                  Number(amount) === amt
                    ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-900/20 dark:text-brand-400'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Method cards */}
        {!intent && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Payment method</p>
            <div className="grid grid-cols-2 gap-2.5">
              {stripeEnabled &&
                methodCard('stripe', 'Card', 'Stripe · auto-confirm', 'Instant', 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400')}
              {paypalEnabled &&
                methodCard('paypal', 'PayPal', 'PayPal · auto-confirm', 'Instant', 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400')}
              {methodCard('bank_transfer', 'Bank transfer', 'Receipt required', 'Admin approval', 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400')}
              {methodCard('pay_later', 'Pay later', 'No receipt needed', 'Admin approval', 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400')}
            </div>
            {!stripeEnabled && !paypalEnabled && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Online payments unavailable — use bank transfer or pay later.</p>
            )}
          </div>
        )}

        {/* Online: create intent → inline payment form */}
        {isOnline && !intent && (
          <button
            type="button"
            onClick={() => {
              if (amountValid) createIntent.mutate({ amt: parsedAmount, gateway: payMethod === 'paypal' ? 'PAYPAL' : 'STRIPE' });
            }}
            disabled={!amountValid || createIntent.isPending}
            className="mt-6 w-full cursor-pointer rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50"
          >
            {createIntent.isPending ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Preparing payment…
              </span>
            ) : (
              `Continue · ${fmt(parsedAmount || 0)}`
            )}
          </button>
        )}

        {isOnline && intent && payMethod === 'stripe' && intent.clientSecret && (
          <div className="mt-5">
            <StripePaymentForm
              key={intent.paymentId}
              clientSecret={intent.clientSecret}
              paymentId={intent.paymentId}
              bookingId={intent.bookingId ?? `topup_${intent.paymentId}`}
              amount={intent.amount}
              currency={intent.currency}
              onSuccess={handleOnlineSuccess}
              onError={(msg) => toasts.error('Payment failed', msg)}
            />
            <button
              type="button"
              onClick={() => setIntent(null)}
              className="mt-3 w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Change amount or method
            </button>
          </div>
        )}

        {isOnline && intent && payMethod === 'paypal' && intent.checkoutUrl && (
          <div className="mt-5">
            <PayPalPaymentButton
              key={intent.paymentId}
              paymentId={intent.paymentId}
              checkoutUrl={intent.checkoutUrl}
              amount={intent.amount}
              currency={intent.currency}
              containerId={paypalContainerId}
              sdkOnly
              onSuccess={handleOnlineSuccess}
              onError={(msg) => toasts.error('Payment failed', msg)}
            />
            <button
              type="button"
              onClick={() => setIntent(null)}
              className="mt-3 w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Change amount or method
            </button>
          </div>
        )}

        {isOnline && intent && ((payMethod === 'stripe' && !intent.clientSecret) || (payMethod === 'paypal' && !intent.checkoutUrl)) && (
          <div className="mt-5 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-800/50 dark:bg-error-950/20 dark:text-error-400">
            Payment could not be prepared. Please try again or use another method.
            <button
              type="button"
              onClick={() => setIntent(null)}
              className="mt-2 w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Back
            </button>
          </div>
        )}

        {/* Offline: bank_transfer = reference + receipt; pay_later = reference optional, no receipt */}
        {!isOnline && (
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reference {payMethod === 'bank_transfer' && <span className="text-error-500">*</span>}
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={payMethod === 'pay_later' ? 'Note for admin (optional)' : 'Transaction / receipt number'}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
            {payMethod === 'bank_transfer' && (
              <>
                <label className="mb-1.5 mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Receipt <span className="font-normal text-gray-400">(image or PDF, max 5MB)</span>
                </label>
                {!file ? (
                  <label className="block cursor-pointer rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">
                    {uploading ? 'Uploading…' : 'Choose file'}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Receipt preview" className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-200 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        PDF
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {uploading ? 'Uploading…' : evidenceUrl ? 'Uploaded' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearFile}
                      disabled={uploading}
                      className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:text-error-400 dark:hover:bg-error-900/20"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const refOk = payMethod === 'pay_later' || reference.trim();
                if (amountValid && refOk) {
                  offlineMutation.mutate({
                    amt: parsedAmount,
                    method: payMethod,
                    ref: reference.trim(),
                    evUrl: payMethod === 'bank_transfer' ? (evidenceUrl ?? undefined) : undefined,
                  });
                }
              }}
              disabled={!amountValid || (payMethod === 'bank_transfer' && !reference.trim()) || uploading || offlineMutation.isPending}
              className="mt-6 w-full cursor-pointer rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50"
            >
              {offlineMutation.isPending ? 'Sending…' : `Send request · ${fmt(parsedAmount || 0)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
