'use client';

import { useState, useMemo } from 'react';
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminCommissions,
  getAdminPendingPayouts,
  markCommissionsAsPaid,
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  listCommissionWithdrawals,
  approveCommissionWithdrawal,
  rejectCommissionWithdrawal,
  type PendingPayouts,
  type PaginatedCommissions,
  type CommissionRule,
} from '@/features/admin/api/admin-commission';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { useToast } from '@/hooks/useToast';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// ─── Inline SVG Icons ─────────────────────────────────────

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}


function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    pending: { label: 'Pending', bg: 'bg-warning-50 dark:bg-warning-900/30', text: 'text-warning-700 dark:text-warning-300', dot: 'bg-warning-500' },
    paid: { label: 'Paid', bg: 'bg-success-50 dark:bg-success-900/20', text: 'text-success-700 dark:text-success-400', dot: 'bg-success-500' },
    reversed: { label: 'Reversed', bg: 'bg-error-50 dark:bg-error-900/20', text: 'text-error-700 dark:text-error-400', dot: 'bg-error-500' },
  };
  const c = config[status] ?? { label: status, bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────

function CommissionsPage() {
  const queryClient = useQueryClient();
  const toasts = useToast();
  const { decimalsMap, ratesMap } = useCurrencyData();

  // ── Tabs ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'payouts' | 'withdrawals' | 'history' | 'rules'>('payouts');

  // ── Payout State ──────────────────────────────────────
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedCommissions, setSelectedCommissions] = useState<Set<string>>(new Set());
  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);
  const [payoutId, setPayoutId] = useState('');

  // ── Rule Modal State ──────────────────────────────────
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '', type: 'percentage', rate: '', applyTo: 'all',
    description: '', agentId: '', agentTierId: '', minAmount: '', maxAmount: '',
    startDate: '', endDate: '', priority: '0',
  });

  // ── Payouts Query ─────────────────────────────────────
  const { data: pendingPayouts, isPending: payoutsLoading, isFetching: payoutsFetching } = useQuery<PendingPayouts>({
    queryKey: ['admin', 'commissions', 'pending-payouts'],
    queryFn: getAdminPendingPayouts,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Reporting currency for payout aggregates (backend converts before
  // summing). Prefer the response code; USD is the historical default.
  const reportingCurrency = pendingPayouts?.currency ?? 'USD';
  // PendingPayouts (totalAmount, per-agent totalCommission) is reported by
  // the backend in the reporting currency regardless of each underlying
  // record's own currency (CommissionService.getPendingPayouts converts).
  const fmtReporting = (n: number) => formatCurrencyWithCode(n, reportingCurrency, decimalsMap);
  // Client-side "Mark All as Paid" / selected-total sums records that can
  // each be in a different currency — convert to the reporting currency
  // before summing so the total isn't silently mixing units, matching the
  // backend's own convention.
  const toReporting = (amount: number, currency: string) => {
    const fromRate = ratesMap[currency] ?? 1;
    const targetRate = ratesMap[reportingCurrency] ?? 1;
    return (amount / fromRate) * targetRate;
  };

  // ── History Tab State ────────────────────────────────
  const [historyPage, setHistoryPage] = useState(1);

  // ── Commissions Query ─────────────────────────────────
  const { data: allCommissions, isPending: commissionsLoading, isFetching: commissionsFetching } = useQuery<PaginatedCommissions>({
    queryKey: ['admin', 'commissions', 'all', selectedAgent, historyPage],
    queryFn: () => getAdminCommissions({ agentProfileId: selectedAgent ?? undefined, page: activeTab === 'history' ? historyPage : undefined, limit: 20 }),
    enabled: activeTab === 'history' || !!selectedAgent,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // ── Rules Query ───────────────────────────────────────
  const { data: rules, isPending: rulesLoading, isFetching: rulesFetching } = useQuery<CommissionRule[]>({
    queryKey: ['admin', 'commissions', 'rules'],
    queryFn: getCommissionRules,
    enabled: activeTab === 'rules',
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // ── Withdrawal queue ──────────────────────────────────
  const { data: withdrawals, isPending: withdrawalsLoading } = useQuery({
    queryKey: ['admin', 'commissions', 'withdrawals', 'pending'],
    queryFn: () => listCommissionWithdrawals('pending'),
    enabled: activeTab === 'withdrawals',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const [wdPayRef, setWdPayRef] = useState('');
  const approveWdMutation = useMutation({
    mutationFn: ({ requestId, ref }: { requestId: string; ref?: string }) => approveCommissionWithdrawal(requestId, ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] });
      setWdPayRef('');
      toasts.success('Withdrawal approved', 'Current pending balance paid out.');
    },
    onError: () => toasts.error('Approve failed', 'Request may already be handled.'),
  });
  const rejectWdMutation = useMutation({
    mutationFn: (requestId: string) => rejectCommissionWithdrawal(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] });
      toasts.success('Withdrawal rejected', 'No money moved.');
    },
    onError: () => toasts.error('Reject failed', 'Request may already be handled.'),
  });

  // ── Payout Mutation ───────────────────────────────────
  const payoutMutation = useMutation({
    mutationFn: () => markCommissionsAsPaid(Array.from(selectedCommissions), payoutId || undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] });
      setShowPayoutConfirm(false);
      setSelectedCommissions(new Set());
      setPayoutId('');
      toasts.success('Payout processed', `${res.count} commission(s) marked as paid.`);
    },
    onError: () => toasts.error('Payout failed', 'Could not process payout.'),
  });

  // ── Rule Mutations ────────────────────────────────────
  const createRuleMutation = useMutation({
    mutationFn: (data: any) => createCommissionRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions', 'rules'] });
      setShowRuleModal(false);
      resetRuleForm();
      toasts.success('Rule created');
    },
    onError: () => toasts.error('Failed to create rule'),
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateCommissionRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions', 'rules'] });
      setShowRuleModal(false);
      resetRuleForm();
      toasts.success('Rule updated');
    },
    onError: () => toasts.error('Failed to update rule'),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteCommissionRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions', 'rules'] });
      toasts.success('Rule deleted');
    },
    onError: () => toasts.error('Failed to delete rule'),
  });

  const resetRuleForm = () => {
    setRuleForm({ name: '', type: 'percentage', rate: '', applyTo: 'all', description: '', agentId: '', agentTierId: '', minAmount: '', maxAmount: '', startDate: '', endDate: '', priority: '0' });
    setEditingRule(null);
  };

  const openRuleEditor = (rule?: CommissionRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        name: rule.name, type: rule.type, rate: String(rule.rate), applyTo: rule.applyTo,
        description: rule.description ?? '', agentId: rule.agentId ?? '', agentTierId: rule.agentTierId ?? '',
        minAmount: rule.minAmount ? String(rule.minAmount) : '', maxAmount: rule.maxAmount ? String(rule.maxAmount) : '',
        startDate: rule.startDate ? rule.startDate.split('T')[0] : '', endDate: rule.endDate ? rule.endDate.split('T')[0] : '',
        priority: String(rule.priority),
      });
    }
    setShowRuleModal(true);
  };

  const saveRule = () => {
    const payload = {
      name: ruleForm.name, type: ruleForm.type, rate: parseFloat(ruleForm.rate),
      applyTo: ruleForm.applyTo, description: ruleForm.description || undefined,
      agentId: ruleForm.agentId || undefined, agentTierId: ruleForm.agentTierId || undefined,
      minAmount: ruleForm.minAmount ? parseFloat(ruleForm.minAmount) : undefined,
      maxAmount: ruleForm.maxAmount ? parseFloat(ruleForm.maxAmount) : undefined,
      startDate: ruleForm.startDate || undefined, endDate: ruleForm.endDate || undefined,
      priority: parseInt(ruleForm.priority) || 0,
    };
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: payload });
    } else {
      createRuleMutation.mutate(payload);
    }
  };

  // ── Selected agent commissions (for drill-down) ───────
  const agentCommissions = useMemo(() => {
    if (!allCommissions?.items || !selectedAgent) return [];
    return allCommissions.items.filter((c) => c.agentProfileId === selectedAgent);
  }, [allCommissions, selectedAgent]);

  const selectedAgentInfo = useMemo(() => {
    if (!selectedAgent || !pendingPayouts) return null;
    return pendingPayouts.records.find((r) => r.agentProfileId === selectedAgent) ?? null;
  }, [selectedAgent, pendingPayouts]);

  // ── Summary Stats ─────────────────────────────────────
  const stats = useMemo(() => {
    if (!pendingPayouts) return { totalAgents: 0, totalAmount: 0, totalRecords: 0 };
    return pendingPayouts;
  }, [pendingPayouts]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Commissions" description="Review agent payouts, commission history, and rules." />

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
        {(['payouts', 'withdrawals', 'history', 'rules'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedAgent(null); setSelectedCommissions(new Set()); }}
            className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'payouts' ? 'Pending Payouts' : tab === 'withdrawals' ? 'Withdrawals' : tab === 'history' ? 'All Commissions' : 'Commission Rules'}
          </button>
        ))}
      </div>

      {/* ── TAB: Pending Payouts ────────────────────────── */}
      {activeTab === 'payouts' && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <UsersIcon className="size-4" />
                <span>Agents Owed</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{stats.totalAgents}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <DollarIcon className="size-4" />
                <span>Total Payable</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-brand-teal-600 dark:text-brand-teal-400">
                {fmtReporting(stats.totalAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <ClockIcon className="size-4" />
                <span>Pending Records</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{stats.totalRecords}</p>
            </div>
          </div>

          {/* Agent list or drill-down */}
          {selectedAgent ? (
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedAgent(null)} className="cursor-pointer text-sm text-brand-teal-500 hover:text-brand-teal-600">← Back</button>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {selectedAgentInfo?.agentName ?? 'Agent'}
                  </h3>
                  <span className="text-xs text-gray-400">{selectedAgentInfo?.agentEmail}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedCommissions(new Set(agentCommissions.map((c) => c.id)));
                    setPayoutId('');
                    setShowPayoutConfirm(true);
                  }}
                  disabled={agentCommissions.length === 0}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-teal-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                >
                  <CheckIcon className="size-3.5" />
                  Mark All as Paid ({fmtReporting(agentCommissions.reduce((s, c) => s + toReporting(c.commissionAmount, c.currency), 0))})
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-gray-800/50">
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Booking</th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Booking Amt</th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Commission</th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Rate</th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
                      <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Select</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {agentCommissions.map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">#{c.bookingId.substring(0, 8)}</td>
                        <td className="px-5 py-3 capitalize text-gray-700 dark:text-gray-300">{c.bookingType}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700">{formatCurrencyWithCode(c.bookingAmount, c.currency, decimalsMap)}</td>
                        <td className="px-5 py-3 text-right font-medium tabular-nums text-brand-teal-600 dark:text-brand-teal-400">
                          {formatCurrencyWithCode(c.commissionAmount, c.currency, decimalsMap)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-600">{c.rateType === 'percentage' ? `${c.rate}%` : formatCurrencyWithCode(c.rate, c.currency, decimalsMap)}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td className="px-5 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCommissions.has(c.id)}
                            onChange={() => {
                              const next = new Set(selectedCommissions);
                              if (next.has(c.id)) { next.delete(c.id); } else { next.add(c.id); }
                              setSelectedCommissions(next);
                            }}
                            className="cursor-pointer rounded border-gray-300 text-brand-teal-500 focus:ring-brand-teal-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedCommissions.size > 0 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-800">
                  <span className="text-xs text-gray-500">{selectedCommissions.size} selected · Total: {fmtReporting(agentCommissions.filter((c) => selectedCommissions.has(c.id)).reduce((s, c) => s + toReporting(c.commissionAmount, c.currency), 0))}</span>
                  <button onClick={() => { setPayoutId(''); setShowPayoutConfirm(true); }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600">
                    <CheckIcon className="size-3.5" /> Pay Selected
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Agents with Pending Commissions</h3>
              </div>
              {payoutsLoading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />))}
                </div>
              ) : pendingPayouts?.records.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <CheckIcon className="size-10 text-gray-200 dark:text-gray-700" />
                  <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">All caught up!</p>
                  <p className="text-xs text-gray-400">No pending commissions to pay out.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pendingPayouts?.records.map((agent) => (
                    <button
                      key={agent.agentProfileId}
                      onClick={() => setSelectedAgent(agent.agentProfileId)}
                      className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal-50 text-sm font-semibold text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">
                          {(agent.agentName?.[0] ?? agent.agentEmail?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{agent.agentName || 'Unnamed Agent'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{agent.agentEmail} · {agent.count} commission(s)</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-brand-teal-600 dark:text-brand-teal-400">
                          {fmtReporting(agent.totalCommission)}
                        </p>
                        <p className="text-xs text-gray-400">payable</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Withdrawals ──────────────────────────── */}
      {activeTab === 'withdrawals' && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Commission Withdrawal Requests</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Approval pays the agent&apos;s current pending balance. Payment reference is optional.
            </p>
          </div>
          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Payment reference (applies to next approval)</label>
            <input
              type="text"
              value={wdPayRef}
              onChange={(e) => setWdPayRef(e.target.value)}
              placeholder="e.g. PAY-2024-001"
              className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {withdrawalsLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />))}
            </div>
          ) : !withdrawals?.length ? (
            <div className="flex flex-col items-center py-12">
              <CheckIcon className="size-10 text-gray-200 dark:text-gray-700" />
              <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No pending withdrawals</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {withdrawals.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {r.amount != null ? formatCurrencyWithCode(r.amount, r.currency ?? reportingCurrency, decimalsMap) : 'Current pending'}
                      <span className="ml-2 text-xs font-normal text-gray-400">{r.reference}</span>
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {(r as any).agentName ?? (r as any).agentEmail ?? r.agentProfileId.substring(0, 8)}{r.description ? ` · ${r.description}` : ''} · {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveWdMutation.mutate({ requestId: r.id, ref: wdPayRef.trim() || undefined })}
                      disabled={approveWdMutation.isPending}
                      className="cursor-pointer rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectWdMutation.mutate(r.id)}
                      disabled={rejectWdMutation.isPending}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: All Commissions ────────────────────────── */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">All Commission Records</h3>
          </div>
          <div className="overflow-x-auto">
            {commissionsLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (<div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />))}
              </div>
            ) : !allCommissions?.items?.length ? (
              <div className="flex flex-col items-center py-12">
                <DollarIcon className="size-10 text-gray-200 dark:text-gray-700" />
                <p className="mt-3 text-sm font-medium text-gray-500">No commission records</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Agent</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Booking</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Commission</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Rate</th>
                    <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                  {allCommissions.items.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">{c.agentProfileId.substring(0, 8)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">#{c.bookingId.substring(0, 8)}</td>
                      <td className="px-5 py-3 capitalize text-gray-700">{c.bookingType}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-brand-teal-600">{formatCurrencyWithCode(c.commissionAmount, c.currency, decimalsMap)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{c.rateType === 'percentage' ? `${c.rate}%` : formatCurrencyWithCode(c.rate, c.currency, decimalsMap)}</td>
                      <td className="px-5 py-3 text-center"><StatusBadge status={c.status} /></td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Pagination */}
          {allCommissions && allCommissions.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-800">
              <p className="text-xs text-gray-400">
                Page {historyPage} of {allCommissions.totalPages} ({allCommissions.total} records)
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, allCommissions.totalPages) }, (_, i) => {
                  const start = Math.max(1, historyPage - 2);
                  const p = start + i;
                  if (p > allCommissions.totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setHistoryPage(p)}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        p === historyPage
                          ? 'border-brand-teal-200 bg-brand-teal-50 text-brand-teal-700 dark:border-brand-teal-700 dark:bg-brand-teal-900/20 dark:text-brand-teal-400'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setHistoryPage((p) => Math.min(allCommissions.totalPages, p + 1))}
                  disabled={historyPage >= allCommissions.totalPages}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Commission Rules ───────────────────────── */}
      {activeTab === 'rules' && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Commission Rules</h3>
            <button onClick={() => { resetRuleForm(); setShowRuleModal(true); }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-teal-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Rule
            </button>
          </div>
          {!rules ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 2 }).map((_, i) => (<div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />))}
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <SettingsIcon className="size-10 text-gray-200 dark:text-gray-700" />
              <p className="mt-3 text-sm font-medium text-gray-500">No commission rules configured</p>
              <button onClick={() => { resetRuleForm(); setShowRuleModal(true); }}
                className="mt-2 text-sm font-medium text-brand-teal-500 hover:text-brand-teal-600 cursor-pointer">Create your first rule</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block h-2 w-2 rounded-full ${rule.isActive ? 'bg-success-500' : 'bg-gray-400'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</p>
                      <p className="text-xs text-gray-400">
                        {rule.type} · {rule.rate}{rule.type === 'percentage' ? '%' : ''} on {rule.applyTo}
                        {rule.description ? ` · ${rule.description.substring(0, 40)}` : ''}
                        <span className="ml-2 text-[10px] text-gray-400">Priority: {rule.priority}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openRuleEditor(rule)}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      Edit
                    </button>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Delete this rule?', message: 'This cannot be undone.', confirmLabel: 'Delete' })) deleteRuleMutation.mutate(rule.id); }}
                      className="cursor-pointer rounded-lg border border-error-200 bg-white px-3 py-1.5 text-xs font-medium text-error-600 transition-colors hover:bg-error-50 dark:border-error-800 dark:bg-gray-800 dark:text-error-400">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Payout Confirm Modal ────────────────────────── */}
      {showPayoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPayoutConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Payout</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Mark <strong>{selectedCommissions.size}</strong> commission(s) as paid? This action cannot be undone.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Payout Reference (optional)</label>
              <input type="text" value={payoutId} onChange={(e) => setPayoutId(e.target.value)}
                placeholder="e.g. PAY-2024-001"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowPayoutConfirm(false)}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => payoutMutation.mutate()} disabled={payoutMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {payoutMutation.isPending ? 'Processing…' : `Pay ${
                  fmtReporting(
                    agentCommissions
                      .filter((c) => selectedCommissions.has(c.id))
                      .reduce((s, c) => s + toReporting(c.commissionAmount, c.currency), 0),
                  )
                }`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rule Edit Modal ─────────────────────────────── */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowRuleModal(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingRule ? 'Edit Rule' : 'New Commission Rule'}</h3>
              <button onClick={() => setShowRuleModal(false)} className="cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><CloseIcon className="size-5" /></button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name *</label>
                <input type="text" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                <select value={ruleForm.type} onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat ($)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Rate *</label>
                <input type="number" step="0.01" min="0" value={ruleForm.rate} onChange={(e) => setRuleForm({ ...ruleForm, rate: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Applies To</label>
                <select value={ruleForm.applyTo} onChange={(e) => setRuleForm({ ...ruleForm, applyTo: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="all">All Products</option>
                  <option value="flights">Flights</option>
                  <option value="hotels">Hotels</option>
                  <option value="packages">Packages</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                <input type="number" min="0" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <input type="text" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Min Amount</label>
                <input type="number" min="0" step="0.01" value={ruleForm.minAmount} onChange={(e) => setRuleForm({ ...ruleForm, minAmount: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Max Amount</label>
                <input type="number" min="0" step="0.01" value={ruleForm.maxAmount} onChange={(e) => setRuleForm({ ...ruleForm, maxAmount: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Agent Tier</label>
                <select value={ruleForm.agentTierId} onChange={(e) => setRuleForm({ ...ruleForm, agentTierId: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="">All Tiers</option>
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
                <input type="date" value={ruleForm.startDate} onChange={(e) => setRuleForm({ ...ruleForm, startDate: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">End Date</label>
                <input type="date" value={ruleForm.endDate} onChange={(e) => setRuleForm({ ...ruleForm, endDate: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowRuleModal(false)}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={saveRule} disabled={!ruleForm.name || !ruleForm.rate || createRuleMutation.isPending || updateRuleMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {createRuleMutation.isPending || updateRuleMutation.isPending ? 'Saving…' : editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCommissionsPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.AGENTS_READ]}>
      <CommissionsPage />
    </RequirePagePermission>
  );
}
