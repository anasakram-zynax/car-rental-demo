'use client';

import { Suspense, useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminAgentStatusBadge } from '@/components/admin/shared/admin-badges';
import { Modal } from '@/components/ui/modal';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import {
  getAgents,
  approveAgent,
  rejectAgent,
  suspendAgent,
  unsuspendAgent,
  type AgentUser,
  type KycStatus,
} from '@/features/admin/api/admin-agents';
import {
  Pencil,
  CheckCircle2,
  X,
  Eye,
  Lock,
  Trash2,
  Search,
  CircleUserRound,
  ChevronDown,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { deleteUser } from '@/features/admin/api/admin-users';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import AvatarText from '@/components/ui/avatar/AvatarText';
import Pagination from '@/components/common/Pagination';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => m.DeleteConfirm),
  { ssr: false }
);

type KycTab = KycStatus | 'ALL';

const KYC_TABS: { key: KycTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

const PAGE_SIZE_DEFAULT = 20;

const actionBtn =
  'inline-flex size-11 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50';

function AgentsPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  const [kycTab, setKycTab] = useState<KycTab>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AgentUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<{
    agent: AgentUser;
    action: 'suspend' | 'unsuspend';
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [kycTab, debouncedSearch]);

  const filters = useMemo(() => ({
    kycStatus: kycTab === 'ALL' ? undefined : kycTab,
    search: debouncedSearch || undefined,
  }), [kycTab, debouncedSearch]);

  const { data: agents, isPending, isFetching } = useQuery<AgentUser[]>({
    queryKey: ['admin', 'agents', filters],
    queryFn: () => getAgents(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: pendingAgents } = useQuery<AgentUser[]>({
    queryKey: ['admin', 'agents', { kycStatus: 'PENDING' as KycStatus }],
    queryFn: () => getAgents({ kycStatus: 'PENDING' }),
    staleTime: 30_000,
  });

  const invalidateAgents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
  }, [queryClient]);

  const approveMutation = useMutation({
    mutationFn: (userId: string) => approveAgent(userId),
    onSuccess: () => {
      invalidateAgents();
      toasts.success('Agent approved', 'The agent can now operate.');
    },
    onError: () => toasts.error('Failed to approve agent'),
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { userId: string; reason: string }) => rejectAgent(data.userId, data.reason),
    onSuccess: () => {
      invalidateAgents();
      setRejectTarget(null);
      setRejectReason('');
      toasts.success('Agent rejected', 'The agent registration has been rejected.');
    },
    onError: () => toasts.error('Failed to reject agent'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      invalidateAgents();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeleteTarget(null);
      toasts.success('Agent deleted', 'The agent has been permanently removed.');
    },
    onError: () => toasts.error('Failed to delete agent'),
  });

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => suspendAgent(userId),
    onSuccess: () => {
      invalidateAgents();
      setSuspendTarget(null);
      toasts.success('Agent suspended', 'The agent is suspended and cannot operate.');
    },
    onError: () => toasts.error('Failed to suspend agent'),
  });

  const unsuspendMutation = useMutation({
    mutationFn: (userId: string) => unsuspendAgent(userId),
    onSuccess: () => {
      invalidateAgents();
      setSuspendTarget(null);
      toasts.success('Agent unsuspended', 'The agent can operate again.');
    },
    onError: () => toasts.error('Failed to unsuspend agent'),
  });

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteMutation, deleteTarget]);

  const confirmSuspend = useCallback(() => {
    if (!suspendTarget) return;
    if (suspendTarget.action === 'suspend') suspendMutation.mutate(suspendTarget.agent.id);
    else unsuspendMutation.mutate(suspendTarget.agent.id);
  }, [suspendMutation, unsuspendMutation, suspendTarget]);

  const handleReject = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    rejectMutation.mutate({ userId: rejectTarget.id, reason: rejectReason.trim() });
  };

  const openReject = (agent: AgentUser) => {
    setRejectTarget(agent);
    setRejectReason('');
  };

  const goToDetail = useCallback((agentId: string) => {
    router.push(`/admin/agents/${agentId}`);
  }, [router]);

  const sorted = useMemo(() => [...(agents ?? [])].sort((a, b) => {
    const nameA = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
    const nameB = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.email;
    return nameA.localeCompare(nameB);
  }), [agents]);

  const pendingList = useMemo(() => [...(pendingAgents ?? [])].sort((a, b) => {
    const nameA = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
    const nameB = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.email;
    return nameA.localeCompare(nameB);
  }), [pendingAgents]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const empty = !isPending && !sorted.length;
  const stats = useMemo(() => {
    const list = agents ?? [];
    return {
      total: list.length,
      pending: pendingList.length || list.filter((a) => a.agentProfile?.kycStatus === 'PENDING').length,
      approved: list.filter((a) => a.agentProfile?.kycStatus === 'APPROVED').length,
      rejected: list.filter((a) => a.agentProfile?.kycStatus === 'REJECTED').length,
    };
  }, [agents, pendingList]);

  const canApprove = hasPermission(PermissionCode.AGENTS_APPROVE);
  const canWrite = hasPermission(PermissionCode.AGENTS_WRITE);
  const canDelete = hasPermission(PermissionCode.USERS_DELETE);
  const suspendBusy = suspendMutation.isPending || unsuspendMutation.isPending;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Agent Management"
        description="Manage agent accounts, approvals, credit limits, and commission rates."
        breadcrumbs={[{ label: 'Agents' }]}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Agents" value={stats.total} tip="All agents registered on the platform, across every KYC status." />
        <StatCard label="Pending Approval" value={stats.pending} tone="warning" sub="Waiting for your review" />
        <StatCard label="Approved" value={stats.approved} tone="success" sub="Active and able to book" />
        <StatCard label="Rejected" value={stats.rejected} tone="error" sub="Registration declined" />
      </div>

      {/* Pending approvals card */}
      <div className="rounded-2xl border border-border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => setPendingExpanded((v) => !v)}
          aria-expanded={pendingExpanded}
          aria-label={pendingExpanded ? 'Collapse pending approvals' : 'Expand pending approvals'}
          className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 p-4 sm:px-6"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="size-2 shrink-0 rounded-full bg-warning-500" aria-hidden />
            <span className="truncate text-sm font-semibold text-foreground">Pending approvals</span>
            <span className="shrink-0 rounded-full bg-warning-500/10 px-2.5 py-0.5 text-xs font-semibold text-warning-700 dark:text-warning-300">
              {pendingList.length}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {pendingExpanded ? 'Hide' : 'Review'}
            <ChevronDown className={cn('size-4 transition-transform', pendingExpanded && 'rotate-180')} />
          </span>
        </button>
        {pendingExpanded && (
          <div className="border-t border-border">
            {pendingList.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-6">
                No pending approvals. All caught up.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {pendingList.map((agent) => {
                  const fullName = [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email;
                  return (
                    <li key={agent.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <AvatarText name={fullName} className="!size-8 shrink-0 !text-[11px] ring-1 ring-black/5 dark:ring-white/10" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground" title={fullName}>
                            {fullName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground" title={agent.email}>
                            {agent.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {canApprove && (
                          <>
                            <button
                              type="button"
                              onClick={() => approveMutation.mutate(agent.id)}
                              disabled={approveMutation.isPending}
                              title="Approve agent"
                              aria-label={`Approve agent ${agent.email}`}
                              className={cn(actionBtn, 'bg-success-500/10 text-success-600 hover:bg-success-500/20 dark:text-success-400')}
                            >
                              <CheckCircle2 className="size-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openReject(agent)}
                              title="Reject agent"
                              aria-label={`Reject agent ${agent.email}`}
                              className={cn(actionBtn, 'bg-error-500/10 text-error-600 hover:bg-error-500/20 dark:text-error-400')}
                            >
                              <X className="size-5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => goToDetail(agent.id)}
                          title="View agent details"
                          aria-label={`View details for ${agent.email}`}
                          className={cn(actionBtn, 'border border-input text-muted-foreground hover:bg-accent hover:text-foreground')}
                        >
                          <Eye className="size-5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Agents table card */}
      <div className="rounded-2xl border border-border bg-card shadow-xs">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-teal-500/10 text-brand-teal-600 dark:text-brand-teal-400">
              <CircleUserRound className="size-4.5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Agents</h3>
              <p className="text-xs text-muted-foreground">
                {isPending ? 'Loading…' : `${total.toLocaleString()} total`}
                {isFetching && !isPending && (
                  <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-brand-teal-500 align-middle" />
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="text"
                placeholder="Search by name, email, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search agents"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 sm:px-6" role="tablist" aria-label="Filter agents by KYC status">
          {KYC_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={kycTab === tab.key}
              onClick={() => setKycTab(tab.key)}
              className={cn(
                'inline-flex min-h-[44px] cursor-pointer items-center rounded-xl px-4 text-sm font-medium transition-colors',
                kycTab === tab.key
                  ? 'bg-brand-teal-500 text-white shadow-sm'
                  : 'border border-input bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.key !== 'ALL' && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({stats[tab.key.toLowerCase() as keyof typeof stats] ?? 0})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table viewport */}
        <div className={cn('admin-table-viewport overflow-x-auto transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
          <table className="w-full min-w-[1100px] table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-[230px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Agent
                </th>
                <th className="w-[210px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="w-[130px] px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Wallet
                </th>
                <th className="w-[180px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Credit Used / Limit
                </th>
                <th className="w-[110px] px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Commission
                </th>
                <th className="w-[140px] px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="w-[120px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Joined
                </th>
                <th className="w-[170px] px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isPending ? (
                <AdminTableSkeleton rows={8} columns={8} shortColumns={[5]} />
              ) : empty ? (
                <tr>
                  <td colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                        <CircleUserRound className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No agents found</p>
                      <p className="text-xs text-muted-foreground">
                        Try clearing or modifying your search and filter parameters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map((agent) => {
                  const profile = agent.agentProfile;
                  const fullName = [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email;
                  const currency = profile?.walletCurrency ?? 'USD';
                  const suspended = profile?.isSuspended ?? agent.status === 'SUSPENDED';
                  const creditText = profile
                    ? `${formatCurrencyWithCode(profile.creditUsed, currency, decimalsMap)} / ${formatCurrencyWithCode(profile.creditLimit, currency, decimalsMap)}`
                    : '—';
                  return (
                    <tr key={agent.id} className="group transition-colors hover:bg-muted/40">
                      {/* Agent */}
                      <td className="px-4 py-3.5">
                        <div className="flex max-w-[220px] min-w-0 items-center gap-2.5">
                          <AvatarText name={fullName} className="!size-8 shrink-0 !text-[11px] ring-1 ring-black/5 dark:ring-white/10" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground" title={fullName}>
                              {fullName}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground" title={profile?.companyName ?? ''}>
                              {profile?.companyName ?? '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3.5">
                        <p className="max-w-[200px] truncate text-xs text-foreground" title={agent.email}>
                          {agent.email}
                        </p>
                      </td>
                      {/* Wallet */}
                      <td className="px-4 py-3.5 text-right">
                        {profile ? (
                          <p
                            className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground"
                            title={`${formatCurrencyWithCode(profile.walletBalance, currency, decimalsMap)} ${currency}`}
                          >
                            {formatCurrencyWithCode(profile.walletBalance, currency, decimalsMap)}
                          </p>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* Credit */}
                      <td className="px-4 py-3.5">
                        <p className="max-w-[170px] truncate text-xs tabular-nums text-foreground" title={creditText}>
                          {creditText}
                        </p>
                      </td>
                      {/* Commission */}
                      <td className="px-4 py-3.5 text-right">
                        {profile ? (
                          <p className="text-xs font-medium tabular-nums text-foreground" title={`${profile.commissionRate}% commission rate`}>
                            {profile.commissionRate}%
                          </p>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <AdminAgentStatusBadge status={profile?.kycStatus ?? 'PENDING'} />
                          {suspended && (
                            <span className="text-[11px] font-medium text-warning-700 dark:text-warning-300">
                              Suspended
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Joined */}
                      <td className="px-4 py-3.5">
                        <p
                          className="whitespace-nowrap text-xs tabular-nums text-foreground"
                          title={new Date(agent.createdAt).toLocaleString()}
                        >
                          {new Date(agent.createdAt).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => goToDetail(agent.id)}
                            title="Edit agent"
                            aria-label={`Edit agent ${agent.email}`}
                            className={cn(actionBtn, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                          >
                            <Pencil className="size-5" />
                          </button>
                          {canWrite && (
                            suspended ? (
                              <button
                                type="button"
                                onClick={() => setSuspendTarget({ agent, action: 'unsuspend' })}
                                title="Unsuspend agent"
                                aria-label={`Unsuspend agent ${agent.email}`}
                                className={cn(actionBtn, 'bg-success-500/10 text-success-600 hover:bg-success-500/20 dark:text-success-400')}
                              >
                                <CheckCircle2 className="size-5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSuspendTarget({ agent, action: 'suspend' })}
                                title="Suspend agent"
                                aria-label={`Suspend agent ${agent.email}`}
                                className={cn(actionBtn, 'bg-warning-500/10 text-warning-700 hover:bg-warning-500/20 dark:text-warning-300')}
                              >
                                <Lock className="size-5" />
                              </button>
                            )
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(agent)}
                              title="Delete agent"
                              aria-label={`Delete agent ${agent.email}`}
                              className={cn(actionBtn, 'text-error-500 hover:bg-error-500/10 dark:text-error-400')}
                            >
                              <Trash2 className="size-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="border-t border-border px-4 py-3.5 sm:px-6">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirm
          open
          count={1}
          noun={`agent (${deleteTarget.email})`}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Suspend / unsuspend confirm */}
      <Modal adminSurface isOpen={!!suspendTarget} onClose={() => setSuspendTarget(null)}>
        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-foreground">
            {suspendTarget?.action === 'suspend' ? 'Suspend agent' : 'Unsuspend agent'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Are you sure?{' '}
            {suspendTarget?.action === 'suspend' ? (
              <>Suspend <strong className="text-foreground">{suspendTarget?.agent.email}</strong>? The agent will be unable to operate until unsuspended.</>
            ) : (
              <>Unsuspend <strong className="text-foreground">{suspendTarget?.agent.email}</strong>? The agent will be able to operate again.</>
            )}
          </p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setSuspendTarget(null)}
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSuspend}
              disabled={suspendBusy}
              className={cn(
                'inline-flex min-h-[44px] cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50',
                suspendTarget?.action === 'suspend'
                  ? 'bg-error-500 hover:bg-error-600'
                  : 'bg-brand-teal-500 hover:bg-brand-teal-600',
              )}
            >
              {suspendBusy ? 'Working…' : suspendTarget?.action === 'suspend' ? 'Suspend agent' : 'Unsuspend agent'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal adminSurface isOpen={!!rejectTarget} onClose={() => { setRejectTarget(null); setRejectReason(''); }}>
        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-foreground">Reject Agent Registration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reject <strong className="text-foreground">{rejectTarget?.email}</strong>? Provide a reason for rejection.
          </p>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-foreground">Reason *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Missing KYC documents, incomplete registration…"
              rows={3}
              className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { setRejectTarget(null); setRejectReason(''); }}
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-error-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-error-600 disabled:opacity-50"
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject Agent'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminAgentsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
      <RequirePagePermission permissions={[PermissionCode.AGENTS_READ]}>
        <AgentsPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
