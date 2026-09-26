'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSubAgents,
  suspendSubAgent,
  reactivateSubAgent,
  removeSubAgent,
  getTeamStats,
  type SubAgentUser,
} from '@/features/agent/api/agent-team';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminUserStatusBadge } from '@/components/admin/shared/admin-badges';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Plus, Pencil, Trash2, Users, Ticket, Wallet, Lock } from 'lucide-react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

function displayName(agent: SubAgentUser) {
  const full = `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim();
  return full || agent.email;
}

function initial(agent: SubAgentUser) {
  return (agent.firstName?.[0] || agent.lastName?.[0] || agent.email[0]).toUpperCase();
}

export default function AgentTeamPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const { decimalsMap } = useCurrencyData();

  const canManage = hasPermission(PermissionCode.AGENT_MANAGE_SUB_AGENTS);

  const { data: subAgents = [], isPending, error } = useQuery<SubAgentUser[]>({
    queryKey: ['agent', 'team'],
    queryFn: listSubAgents,
    enabled: canManage,
  });

  const { data: teamStats } = useQuery({
    queryKey: ['agent', 'team', 'stats'],
    queryFn: getTeamStats,
    enabled: canManage,
    staleTime: 60_000,
  });

  const suspendMutation = useMutation({
    mutationFn: suspendSubAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'team'] }),
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateSubAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'team'] }),
  });

  const removeMutation = useMutation({
    mutationFn: removeSubAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'team'] });
      setConfirmDelete(null);
    },
  });

  const stats = useMemo(() => {
    const fallbackBookings = subAgents.reduce((sum, a) => sum + (a.totalBookings ?? 0), 0);
    const fallbackRevenue = subAgents.reduce((sum, a) => sum + (a.totalSpent ?? 0), 0);
    return {
      members: teamStats?.subAgentCount ?? subAgents.length,
      bookings: teamStats?.totalBookings ?? fallbackBookings,
      revenue: teamStats?.totalRevenue ?? fallbackRevenue,
    };
  }, [subAgents, teamStats]);

  const columns = useMemo((): ColumnDef<SubAgentUser>[] => [
    {
      id: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      accessorFn: (row) => displayName(row),
      cell: ({ row }) => {
        const agent = row.original;
        return (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal-500/10 text-xs font-semibold text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">
              {initial(agent)}
            </div>
            <span className="text-sm font-medium text-foreground">{displayName(agent)}</span>
          </div>
        );
      },
    },
    {
      id: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      accessorKey: 'email',
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">{getValue<string>()}</span>
      ),
    },
    {
      id: 'role',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      accessorKey: 'roleName',
      cell: ({ row }) => {
        const agent = row.original;
        const pct = agent.creditLimit > 0 ? Math.min(100, (agent.creditUsed / agent.creditLimit) * 100) : 0;
        return (
          <div className="min-w-28">
            <p className="text-sm text-foreground">{agent.roleName ?? '—'}</p>
            <div
              className="mt-1 h-1 w-full rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Credit used"
            >
              <div className="h-1 rounded-full bg-brand-teal-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {formatCurrencyWithCode(agent.creditUsed, agent.walletCurrency ?? 'USD', decimalsMap)} /{' '}
              {formatCurrencyWithCode(agent.creditLimit, agent.walletCurrency ?? 'USD', decimalsMap)}
            </p>
          </div>
        );
      },
    },
    {
      id: 'bookings',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bookings" />,
      accessorKey: 'totalBookings',
      cell: ({ row }) => {
        const agent = row.original;
        return (
          <div>
            <p className="text-sm tabular-nums text-foreground">{agent.totalBookings}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrencyWithCode(agent.totalSpent, agent.walletCurrency ?? 'USD', decimalsMap)}
            </p>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorKey: 'status',
      cell: ({ getValue }) => <AdminUserStatusBadge status={getValue<string>()} />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const agent = row.original;
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-brand-teal-600"
              onClick={() => router.push(`/agent/team/${agent.userId}`)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {agent.isSuspended ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                disabled={reactivateMutation.isPending}
                onClick={() => reactivateMutation.mutate(agent.userId)}
              >
                Reactivate
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-600 hover:text-amber-700 dark:text-amber-400"
                disabled={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate(agent.userId)}
              >
                Suspend
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(agent.userId)}
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ], [decimalsMap, reactivateMutation, router, suspendMutation]);

  const table = useReactTable({
    data: subAgents,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!canManage) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your plan does not include team management.</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: 'Team members', value: String(stats.members), icon: Users },
    { title: 'Total bookings', value: String(stats.bookings), icon: Ticket },
    {
      title: 'Total revenue',
      value: formatCurrencyWithCode(stats.revenue, subAgents[0]?.walletCurrency ?? 'USD', decimalsMap),
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="My Team"
        description={
          subAgents.length > 0
            ? `${subAgents.length} sub-agent${subAgents.length !== 1 ? 's' : ''}`
            : 'Manage your sub-agents and team members'
        }
        actions={
          <Link href="/agent/team/invite">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Create Sub-Agent
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map(({ title, value, icon: Icon }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-teal-500/10 text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="truncate text-xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <DashboardCard
        title="Team members"
        period={subAgents.length ? `${subAgents.length} total` : undefined}
        action={<DashboardCardActionsDropdown />}
        size="lg"
        className="admin-table-card"
        contentClassName="gap-y-0"
      >
        <div className="admin-table-viewport">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableCell isHeader key={h.id}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPending ? (
                <AdminTableSkeleton rows={6} columns={6} shortColumns={[3, 4]} />
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <p className="text-sm text-destructive">Failed to load team members. Please try again.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['agent', 'team'] })}
                    >
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No team members yet</p>
                      <p className="text-sm text-muted-foreground">Create sub-agents to help manage bookings and customers.</p>
                      <Link href="/agent/team/invite">
                        <Button size="sm" className="mt-1 gap-1.5">
                          <Plus className="h-4 w-4" />
                          Create Your First Sub-Agent
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/agent/team/${row.original.userId}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DashboardCard>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground">Remove Sub-Agent?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will revoke their access. This action can be reversed by an admin.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={removeMutation.isPending}
                onClick={() => removeMutation.mutate(confirmDelete)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
