'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import {
  requestWalletWithdrawal,
} from '@/features/wallet/api/agent-wallet';
import {
  requestCommissionWithdrawal,
} from '@/features/commission/api/agent-commission';
import { apiRequest } from '@/lib/api/client';

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'agent' | 'customer';
  pool: 'wallet' | 'commission';
  walletBalance: number;
  walletCurrency: string;
  commissionPending?: number;
  commissionCurrency?: string;
  onSuccess?: () => void;
}

export function WithdrawModal({
  open,
  onClose,
  mode,
  pool: initialPool,
  walletBalance: rawBalance,
  walletCurrency = 'USD',
  commissionPending: rawPending = 0,
  commissionCurrency,
  onSuccess,
}: WithdrawModalProps) {
  const queryClient = useQueryClient();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  // ponytail: finite guards — a NaN/undefined balance must disable, never crash.
  const walletBalance = Number.isFinite(rawBalance) ? (rawBalance as number) : 0;
  const commissionPending = Number.isFinite(rawPending) ? (rawPending as number) : 0;
  const safeDecimals = decimalsMap ?? {};

  // Customer lane: wallet only. Agent lane: pool selector.
  const poolLocked = mode === 'customer';
  const [pool, setPool] = useState<'wallet' | 'commission'>(poolLocked ? 'wallet' : initialPool);
  const [amount, setAmount] = useState('');
  const [methodName, setMethodName] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (open) {
      setPool(poolLocked ? 'wallet' : initialPool);
      setAmount('');
      setMethodName('');
      setDetails('');
    }
  }, [open, initialPool, poolLocked]);

  const isCommission = !poolLocked && pool === 'commission';
  const maxHint = isCommission ? commissionPending : walletBalance;
  const hintCurrency = isCommission ? (commissionCurrency ?? walletCurrency) : walletCurrency;
  const fmt = (n: number) => {
    const safe = Number.isFinite(n) ? n : 0;
    return formatCurrencyWithCode(safe, hintCurrency, safeDecimals);
  };

  const parsed = parseFloat(amount);
  const amountValid = isCommission ? true : Number.isFinite(parsed) && parsed > 0 && parsed <= walletBalance;
  const methodValid = methodName.trim().length > 0;
  const detailsValid = details.trim().length > 0;
  const canSubmit = isCommission
    ? methodValid && detailsValid && commissionPending > 0
    : amountValid && methodValid && detailsValid;

  const mutation = useMutation({
    mutationFn: () => {
      if (isCommission) {
        return requestCommissionWithdrawal(methodName.trim(), details.trim());
      }
      if (mode === 'customer') {
        return apiRequest<unknown>('/customer/wallet/withdrawals', {
          method: 'POST',
          body: { amount: parsed, methodName: methodName.trim(), details: details.trim() },
          auth: true,
        });
      }
      return requestWalletWithdrawal(parsed, methodName.trim(), details.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent'] });
      queryClient.invalidateQueries({ queryKey: ['customer', 'wallet'] });
      toasts.success('Withdrawal requested', 'Funds locked pending admin approval.');
      onSuccess?.();
      onClose();
    },
    onError: (err: unknown) =>
      toasts.error('Request failed', err instanceof Error ? err.message : 'Could not submit withdrawal request.'),
  });

  // ponytail: early return AFTER all hooks — returning before useMutation
  // throws React #310 (hook count changes between renders).
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Withdraw funds</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isCommission
            ? 'Approval pays your current pending commission balance. Funds move after admin approval.'
            : 'Requested amount is locked immediately and released if rejected.'}
        </p>

        {/* Pool selector (agent only) */}
        {!poolLocked && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Withdraw from</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(['wallet', 'commission'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPool(p)}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition-all ${
                    pool === p
                      ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200 dark:border-brand-600 dark:bg-brand-900/20'
                      : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {p === 'wallet' ? 'Wallet' : 'Commission'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p === 'wallet'
                      ? formatCurrencyWithCode(walletBalance, walletCurrency, safeDecimals)
                      : `${formatCurrencyWithCode(commissionPending, commissionCurrency ?? walletCurrency, safeDecimals)} pending`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount */}
        {!isCommission && (
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Amount ({hintCurrency})
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={maxHint}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-lg font-semibold text-gray-900 placeholder-gray-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Available: {fmt(maxHint)}
              {Number.isFinite(parsed) && parsed > maxHint && (
                <span className="ml-1 font-medium text-error-500">Exceeds available balance.</span>
              )}
            </p>
          </div>
        )}
        {isCommission && (
          <div className="mt-5 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            Approval pays current pending balance ({fmt(commissionPending)}). No amount needed.
          </div>
        )}

        {/* Method */}
        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Method <span className="text-error-500">*</span>
          </label>
          <input
            value={methodName}
            onChange={(e) => setMethodName(e.target.value)}
            placeholder="Bank transfer, JazzCash, PayPal"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* Details */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Account details <span className="text-error-500">*</span>
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Account number / title, bank name, IBAN"
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="flex-1 cursor-pointer rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50"
          >
            {mutation.isPending
              ? 'Sending…'
              : isCommission
                ? 'Request commission payout'
                : `Withdraw ${fmt(parsed || 0)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
