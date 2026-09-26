'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { getUser, getRoles, updateUser, type UserDetail, type RoleEntity } from '@/features/admin/api/admin-users';
import {
  getAdminCustomerWallet,
  getAdminCustomerWalletTransactions,
  adminAdjustCustomerWalletBalance,
  listCustomerTopupRequests,
  approveCustomerTopupRequest,
  rejectCustomerTopupRequest,
  listCustomerWithdrawals,
  approveCustomerWithdrawal,
  rejectCustomerWithdrawal,
} from '@/features/admin/api/admin-customer-wallet';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { ChevronLeftIcon } from '@/icons';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  const { data: user, isPending } = useQuery<UserDetail>({
    queryKey: ['admin', 'user', id],
    queryFn: () => getUser(id),
    enabled: !!id,
  });

  const { data: roles } = useQuery<RoleEntity[]>({
    queryKey: ['admin', 'roles'],
    queryFn: () => getRoles(),
  });

  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [isRoleDirty, setIsRoleDirty] = useState(false);

  const roleUpdate = useMutation({
    mutationFn: (roleId: string) => updateUser(id, { roleId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] }); queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); setIsRoleDirty(false); },
  });

  const effectiveRoleId = isRoleDirty ? selectedRoleId : (user?.roleId ?? '');

  // ── Customer Money (prepaid wallet only) ──
  const isCustomer = user?.userType === 'CUSTOMER';
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [walletTxnPage, setWalletTxnPage] = useState(1);

  const { data: wallet } = useQuery({
    queryKey: ['admin', 'customer', id, 'wallet'],
    queryFn: () => getAdminCustomerWallet(id),
    enabled: !!id && isCustomer,
  });

  const { data: walletTxns } = useQuery({
    queryKey: ['admin', 'customer', id, 'wallet-transactions', walletTxnPage],
    queryFn: () => getAdminCustomerWalletTransactions(id, { page: walletTxnPage, limit: 10 }),
    enabled: !!id && isCustomer,
  });

  const { data: topupQueue, refetch: refetchTopupQueue } = useQuery({
    queryKey: ['admin', 'customer-topup-requests', 'pending'],
    queryFn: () => listCustomerTopupRequests('pending'),
    enabled: !!id && isCustomer,
  });

  const { data: withdrawalQueue, refetch: refetchWithdrawalQueue } = useQuery({
    queryKey: ['admin', 'customer-withdrawals', 'pending'],
    queryFn: () => listCustomerWithdrawals('pending'),
    enabled: !!id && isCustomer,
  });
  const [payRef, setPayRef] = useState<Record<string, string>>({});

  const wCur = wallet?.wallet?.currency ?? 'USD';
  const wmt = (v: number | null | undefined) => formatCurrencyWithCode(v ?? 0, wCur, decimalsMap);
  const pendingForUser = (topupQueue ?? []).filter((r) => r.userId === id);
  const pendingWdForUser = (withdrawalQueue ?? []).filter((r) => r.userId === id);

  const adjustBalanceMutation = useMutation({
    mutationFn: ({ amount, reason }: { amount: number; reason: string }) =>
      adminAdjustCustomerWalletBalance(id, amount, reason),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'wallet-transactions'] });
      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      toasts.success(
        'Balance adjusted',
        `Wallet ${res.type === 'deposit' ? 'credited' : 'debited'} ${formatCurrencyWithCode(Math.abs(res.amount), res.currency ?? wCur, decimalsMap)}.`,
      );
    },
    onError: () => toasts.error('Failed to adjust balance'),
  });

  const approveTopupMutation = useMutation({
    mutationFn: (requestId: string) => approveCustomerTopupRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'wallet-transactions'] });
      refetchTopupQueue();
      toasts.success('Top-up approved', 'Wallet credited.');
    },
    onError: () => toasts.error('Approve failed', 'Request may already be handled.'),
  });

  const rejectTopupMutation = useMutation({
    mutationFn: (requestId: string) => rejectCustomerTopupRequest(requestId),
    onSuccess: () => {
      refetchTopupQueue();
      toasts.success('Top-up rejected', 'No money moved.');
    },
    onError: () => toasts.error('Reject failed', 'Request may already be handled.'),
  });

  const approveWithdrawalMutation = useMutation({
    mutationFn: ({ requestId, ref }: { requestId: string; ref?: string }) => approveCustomerWithdrawal(requestId, ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'wallet-transactions'] });
      refetchWithdrawalQueue();
      toasts.success('Withdrawal approved', 'Locked funds released for payout.');
    },
    onError: () => toasts.error('Approve failed', 'Request may already be handled.'),
  });

  const rejectWithdrawalMutation = useMutation({
    mutationFn: (requestId: string) => rejectCustomerWithdrawal(requestId),
    onSuccess: () => {
      refetchWithdrawalQueue();
      toasts.success('Withdrawal rejected', 'Locked funds released back to wallet.');
    },
    onError: () => toasts.error('Reject failed', 'Request may already be handled.'),
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb pageTitle="User Detail" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb pageTitle="User Detail" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">User not found</p>
          <button onClick={() => router.back()} className="mt-3 cursor-pointer text-sm text-brand-teal-500 hover:underline">Go back</button>
        </div>
      </div>
    );
  }

  const handleRoleSave = () => {
    if (isRoleDirty && selectedRoleId) {
      roleUpdate.mutate(selectedRoleId);
    } else {
      setIsRoleDirty(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-success-500';
      case 'INACTIVE': return 'bg-gray-400';
      case 'SUSPENDED': return 'bg-error-500';
      case 'PENDING_VERIFICATION': return 'bg-warning-500';
      default: return 'bg-gray-400';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'INACTIVE': return 'Inactive';
      case 'SUSPENDED': return 'Suspended';
      case 'PENDING_VERIFICATION': return 'Pending';
      default: return status;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';
      case 'INACTIVE': return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
      case 'SUSPENDED': return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';
      case 'PENDING_VERIFICATION': return 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const userTypeLabel = (ut: string) => {
    switch (ut) {
      case 'STAFF': return 'Staff';
      case 'CUSTOMER': return 'Customer';
      case 'AGENT': return 'Agent';
      default: return ut;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => router.back()} className="mb-3 inline-flex cursor-pointer items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ChevronLeftIcon className="size-5" /> Back
        </button>
        <PageBreadcrumb pageTitle={[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal-50 text-xl font-semibold text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">
              {(user.firstName?.[0] ?? user.email[0]).toUpperCase()}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusBg(user.status)}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor(user.status)}`} />
                {statusLabel(user.status)}
              </span>
              <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {userTypeLabel(user.userType)}
              </span>
            </div>
          </div>
          <div className="mt-6 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
            <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Member since</span><span className="text-gray-900 dark:text-white">{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Last login</span><span className="text-gray-900 dark:text-white">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Phone</span><span className="text-gray-900 dark:text-white">{user.phone || '—'}</span></div>
          </div>
        </div>

        {/* Role & details */}
        <div className="space-y-6 lg:col-span-2">
          {user.userType === 'STAFF' && hasPermission(PermissionCode.USERS_WRITE) && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Role Assignment</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">STAFF users require a role assignment.</p>
              <div className="mt-4 flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                  <select value={effectiveRoleId} onChange={(e) => { setSelectedRoleId(e.target.value); setIsRoleDirty(true); }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30">
                    {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                {isRoleDirty && (
                  <button onClick={handleRoleSave} disabled={roleUpdate.isPending}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                    {roleUpdate.isPending ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Money — CUSTOMER prepaid wallet only */}
          {isCustomer && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Money</h3>
                {hasPermission(PermissionCode.USERS_WRITE) && (
                  <button
                    onClick={() => { setAdjustAmount(''); setAdjustReason(''); setShowAdjustModal(true); }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600"
                  >
                    + Adjust Balance
                  </button>
                )}
              </div>

              {!wallet ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-brand-teal-500" />
                </div>
              ) : wallet.wallet ? (
                <div className="mt-4 rounded-xl bg-brand-teal-50 p-4 dark:bg-brand-teal-900/20">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Wallet balance</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{wmt(wallet.wallet.walletBalance)}</p>
                  <p className="text-xs text-gray-400">Prepaid — spent first, no credit line</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-400 italic">No wallet record yet — it is created on first top-up.</p>
              )}

              {/* Pending top-up requests for this customer */}
              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Top-up requests — pending approval</h4>
                  <span className="text-xs text-gray-400">{pendingForUser.length} pending</span>
                </div>
                {pendingForUser.length === 0 ? (
                  <p className="mt-3 text-xs text-gray-400 italic">No pending requests for this customer.</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {pendingForUser.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/50">
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-gray-800 dark:text-gray-200">+{formatCurrencyWithCode(r.amount, r.currency ?? wCur, decimalsMap)}</span>
                          <span className="ml-2 truncate text-gray-400">{r.description ?? 'Top-up request'}{r.reference ? ` · ${r.reference}` : ''} · {new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                        {hasPermission(PermissionCode.USERS_WRITE) && (
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => approveTopupMutation.mutate(r.id)}
                              disabled={approveTopupMutation.isPending}
                              className="cursor-pointer rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectTopupMutation.mutate(r.id)}
                              disabled={rejectTopupMutation.isPending}
                              className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending withdrawal requests for this customer */}
              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Withdrawals — pending approval</h4>
                  <span className="text-xs text-gray-400">{pendingWdForUser.length} pending</span>
                </div>
                {pendingWdForUser.length === 0 ? (
                  <p className="mt-3 text-xs text-gray-400 italic">No pending withdrawals for this customer.</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {pendingWdForUser.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/50">
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-gray-800 dark:text-gray-200">−{formatCurrencyWithCode(Math.abs(r.amount), r.currency ?? wCur, decimalsMap)}</span>
                          <span className="ml-2 truncate text-gray-400" title={r.description ?? r.reference ?? undefined}>{r.reference ?? 'Withdrawal'}{r.description ? ` · ${r.description}` : ''} · {new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                        {hasPermission(PermissionCode.USERS_WRITE) && (
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <input
                              value={payRef[r.id] ?? ''}
                              onChange={(e) => setPayRef((p) => ({ ...p, [r.id]: e.target.value }))}
                              placeholder="Payment ref (optional)"
                              className="w-40 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                            />
                            <button
                              onClick={() => approveWithdrawalMutation.mutate({ requestId: r.id, ref: payRef[r.id]?.trim() || undefined })}
                              disabled={approveWithdrawalMutation.isPending}
                              className="cursor-pointer rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectWithdrawalMutation.mutate(r.id)}
                              disabled={rejectWithdrawalMutation.isPending}
                              className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Transaction history */}
              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Transaction history</h4>
                  {walletTxns?.transactions && (
                    <span className="text-xs text-gray-400">{walletTxns.transactions.total} transactions</span>
                  )}
                </div>
                {!walletTxns ? (
                  <div className="mt-3 h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                ) : walletTxns.transactions && walletTxns.transactions.items.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {walletTxns.transactions.items.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/50">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                            txn.type === 'deposit' ? 'bg-success-500' : txn.type === 'deduct' ? 'bg-error-500' : 'bg-warning-500'
                          }`} />
                          <span className="shrink-0 font-medium capitalize text-gray-700 dark:text-gray-300">
                            {txn.type.replace(/_/g, ' ')}
                          </span>
                          <span className="truncate text-gray-400">{txn.description || '—'}</span>
                        </div>
                        <div className="ml-3 flex shrink-0 items-center gap-3">
                          <span className="text-gray-400">{new Date(txn.createdAt).toLocaleDateString()}</span>
                          <span className={`font-mono font-medium ${
                            txn.amount >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'
                          }`}>
                            {txn.amount >= 0 ? '+' : '−'}{formatCurrencyWithCode(Math.abs(txn.amount), txn.currency ?? wCur, decimalsMap)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {walletTxns.transactions.totalPages > 1 && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => setWalletTxnPage((p) => Math.max(1, p - 1))}
                          disabled={walletTxnPage <= 1}
                          className="cursor-pointer text-xs font-medium text-brand-teal-500 hover:text-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ← Previous
                        </button>
                        <span className="text-xs text-gray-400">Page {walletTxnPage} of {walletTxns.transactions.totalPages}</span>
                        <button
                          onClick={() => setWalletTxnPage((p) => Math.min(walletTxns.transactions!.totalPages, p + 1))}
                          disabled={walletTxnPage >= (walletTxns.transactions?.totalPages ?? 1)}
                          className="cursor-pointer text-xs font-medium text-brand-teal-500 hover:text-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-400 italic">No transactions yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Adjust Balance Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAdjustModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Adjust Wallet Balance</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Current balance: <strong>{wmt(wallet?.wallet?.walletBalance)}</strong>
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Amounts are in the customer&apos;s wallet currency ({wCur}). Positive credits the wallet, negative debits it.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount ({wCur})</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 100 or -50"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Reason *</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Refund, correction"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowAdjustModal(false)}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={() => {
                const amount = parseFloat(adjustAmount);
                if (!isNaN(amount) && amount !== 0 && adjustReason.trim()) {
                  adjustBalanceMutation.mutate({ amount, reason: adjustReason.trim() });
                }
              }} disabled={adjustBalanceMutation.isPending || !adjustAmount || isNaN(parseFloat(adjustAmount)) || parseFloat(adjustAmount) === 0 || !adjustReason.trim()}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {adjustBalanceMutation.isPending ? 'Adjusting…' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUserDetailPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.USERS_READ]}>
      <UserDetailPage />
    </RequirePagePermission>
  );
}
