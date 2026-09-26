'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubAgentDetail,
  updateSubAgent,
  suspendSubAgent,
  reactivateSubAgent,
  getAgentRoles,
  type SubAgentDetail,
} from '@/features/agent/api/agent-team';
import { ArrowUpIcon } from '@/components/agent/AgentIcons';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

type Tab = 'overview' | 'bookings' | 'audit';

export default function AgentSubAgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: agent, isPending, error } = useQuery<SubAgentDetail | null>({
    queryKey: ['agent', 'team', id],
    queryFn: () => getSubAgentDetail(id),
    enabled: !!id,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['agent', 'team', 'roles'],
    queryFn: getAgentRoles,
  });

  const [editMode, setEditMode] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'reactivate' | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', roleId: '', creditLimit: 0 });
  const { decimalsMap } = useCurrencyData();
  // Wallet-domain figures (backend) — shown with the sub-agent's wallet code.
  const wCur = agent?.walletCurrency ?? 'USD';
  const wmt = (n: number) => formatCurrencyWithCode(n, wCur, decimalsMap);

  const updateMutation = useMutation({
    mutationFn: () => updateSubAgent(id, editForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'team'] });
      setEditMode(false);
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () => suspendSubAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'team'] }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateSubAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'team'] }),
  });

  const enterEditMode = () => {
    if (!agent) return;
    setEditForm({
      firstName: agent.firstName ?? '',
      lastName: agent.lastName ?? '',
      roleId: '',
      creditLimit: agent.creditLimit,
    });
    setEditMode(true);
  };

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-brand-teal-200 border-t-brand-teal-600" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-gray-500">Sub-agent not found.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: `Bookings (${agent.recentBookings.length})` },
    { key: 'audit', label: 'Activity' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        <ArrowUpIcon className="size-4 rotate-180" /> Back to Team
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {agent.firstName || agent.lastName ? `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim() : agent.email}
          </h1>
          <p className="text-sm text-gray-500">{agent.email}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${agent.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {agent.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? 'border-b-2 border-brand-teal-500 text-brand-teal-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Role</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{agent.roleName ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Total Bookings</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{agent.totalBookings}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Total Spent</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{wmt(agent.totalSpent)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Commission Rate</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{agent.commissionRate}%</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Credit Usage</p>
            <div className="mb-2 h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-3 rounded-full bg-brand-teal-500 transition-all"
                style={{ width: `${agent.creditLimit > 0 ? Math.min(100, (agent.creditUsed / agent.creditLimit) * 100) : 0}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{wmt(agent.creditUsed)} used</span>
              <span>{wmt(agent.creditLimit)} limit</span>
            </div>
          </div>

          {agent.lastLoginAt && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-sm text-gray-500">
                Last login: {new Date(agent.lastLoginAt).toLocaleString()} · Joined: {new Date(agent.createdAt).toLocaleDateString()} · {agent.permissions.length} permissions
              </p>
            </div>
          )}

          {/* Edit / Suspend / Reactivate */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={enterEditMode}
              className="rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-teal-600">
              Edit
            </button>
            {agent.isSuspended ? (
              <button onClick={() => setConfirmAction('reactivate')}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                Reactivate
              </button>
            ) : (
              <button onClick={() => setConfirmAction('suspend')}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100">
                Suspend
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit Mode Modal */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Sub-Agent</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">First Name</label>
                <input type="text" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Last Name</label>
                <input type="text" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select value={editForm.roleId} onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                  <option value="">No change</option>
                  {roles.map((role: any) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Credit Limit ($)</label>
                <input type="number" min="0" value={editForm.creditLimit} onChange={(e) => setEditForm({ ...editForm, creditLimit: Number(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditMode(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
                className="rounded-xl bg-brand-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal-600 disabled:opacity-50">
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings Tab */}
      {tab === 'bookings' && (
        <div className="mt-6">
          {agent.recentBookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <p className="text-sm text-gray-500">No bookings yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agent.recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-lg px-2 py-1 text-xs font-medium ${b.type === 'flight' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {b.type}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{b.id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-500">{new Date(b.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrencyWithCode(b.amount ?? 0, b.currency, decimalsMap)}</p>
                    <span className={`text-xs ${b.status === 'CONFIRMED' ? 'text-emerald-600' : 'text-amber-600'}`}>{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit Tab */}
      {tab === 'audit' && (
        <div className="mt-6">
          {agent.recentAudit.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <p className="text-sm text-gray-500">No activity yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {agent.recentAudit.map((a, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${a.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' : a.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                    {a.action}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{a.description}</p>
                    <p className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm suspend/reactivate */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {confirmAction === 'suspend' ? 'Suspend Sub-Agent?' : 'Reactivate Sub-Agent?'}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {confirmAction === 'suspend'
                ? 'They will be unable to access the agent portal or make bookings.'
                : 'They will regain full access to the agent portal.'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => {
                if (confirmAction === 'suspend') suspendMutation.mutate();
                else reactivateMutation.mutate();
                setConfirmAction(null);
              }}
                disabled={suspendMutation.isPending || reactivateMutation.isPending}
                className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmAction === 'suspend' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                {suspendMutation.isPending || reactivateMutation.isPending ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
