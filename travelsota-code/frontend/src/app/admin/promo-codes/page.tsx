'use client';

import { Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, TicketPercent, Settings2, ReceiptText, ScrollText } from 'lucide-react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import {
  getPromoCodes, getPromoCodeStats, getPromoRedemptions, getPromoAuditLogs,
  createPromoCode, updatePromoCode, updatePromoCodeStatus, archivePromoCode,
  type PromoCode, type CreatePromoCodeInput, type UpdatePromoCodeInput,
  type PaginatedPromoCodes, type PromoStatsSummary, type PromoRedemption,
  type PaginatedRedemptions, type PromoAuditLog,
} from '@/features/admin/api/admin-promo-codes';
import { useToast } from '@/hooks/useToast';
import { DashboardCard, DashboardOverviewCardV2, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode, getCurrencyMinorUnit } from '@/lib/utils/currency';
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => ({ default: m.DeleteConfirm })),
  { ssr: false }
);

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ['', 'DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────
const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'warning' | 'error'> = {
  DRAFT: 'secondary', ACTIVE: 'success', PAUSED: 'warning', EXPIRED: 'error', ARCHIVED: 'secondary',
};
const REDEMPTION_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'error' | 'secondary'> = {
  RESERVED: 'info', REDEEMED: 'success', RELEASED: 'warning', REFUNDED: 'error',
};

/** Minor-unit → major units using the currency's real decimals (not /100). */
function minorToMajor(minor: number, currency: string, decimalsMap?: Record<string, number>): number {
  return minor / Math.pow(10, getCurrencyMinorUnit(currency, decimalsMap));
}

function formatDiscount(p: PromoCode, decimalsMap?: Record<string, number>) {
  if (p.discountType === 'PERCENTAGE') {
    const pct = p.discountPercentBps != null ? (p.discountPercentBps / 100).toFixed(1) : (p.discountValueMinor / 100).toFixed(1);
    return `${pct}%`;
  }
  // FIXED discounts are denominated in p.currency — was rendering a bare
  // number with no currency label at all.
  const code = p.currency ?? 'USD';
  return `${formatCurrencyWithCode(minorToMajor(p.discountValueMinor, code, decimalsMap), code, decimalsMap)}`;
}

function newFormState(): FormState { return { code: '', name: '', description: '', discountType: 'PERCENTAGE', discountValueMinor: '', discountPercentBps: '', maxDiscountMinor: '', minBookingAmountMinor: '', currency: '', startsAt: '', endsAt: '', totalUsageLimit: '', perUserLimit: '', firstBookingOnly: false, customerType: 'ALL', productTypes: [] as string[], isPublic: true, eligibleRoutes: '', eligibleAirlines: '' }; }

interface FormState { code: string; name: string; description: string; discountType: 'PERCENTAGE' | 'FIXED'; discountValueMinor: string; discountPercentBps: string; maxDiscountMinor: string; minBookingAmountMinor: string; currency: string; startsAt: string; endsAt: string; totalUsageLimit: string; perUserLimit: string; firstBookingOnly: boolean; customerType: string; productTypes: string[]; isPublic: boolean; eligibleRoutes: string; eligibleAirlines: string; }

function toCreateInput(f: FormState): CreatePromoCodeInput {
  return {
    code: f.code, name: f.name, description: f.description || undefined, discountType: f.discountType,
    discountValueMinor: Number(f.discountValueMinor),
    discountPercentBps: f.discountType === 'PERCENTAGE' && f.discountPercentBps ? Number(f.discountPercentBps) : undefined,
    maxDiscountMinor: f.maxDiscountMinor ? Number(f.maxDiscountMinor) : undefined,
    minBookingAmountMinor: f.minBookingAmountMinor ? Number(f.minBookingAmountMinor) : undefined,
    currency: f.currency || undefined, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
    endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined,
    totalUsageLimit: f.totalUsageLimit ? Number(f.totalUsageLimit) : undefined,
    perUserLimit: f.perUserLimit ? Number(f.perUserLimit) : undefined,
    firstBookingOnly: f.firstBookingOnly, customerType: f.customerType,
    productTypes: f.productTypes.length ? f.productTypes : undefined, isPublic: f.isPublic,
    eligibleRoutes: f.eligibleRoutes ? f.eligibleRoutes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    eligibleAirlines: f.eligibleAirlines ? f.eligibleAirlines.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  };
}

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10';

// ─── Main Component ───────────────────────────────────────────────────
function PromoCodesPageInner() {
  const queryClient = useQueryClient(); const { hasPermission } = usePermissions(); const toasts = useToast();
  const { decimalsMap } = useCurrencyData();
  const [page, setPage] = useState(1); const [statusFilter, setStatusFilter] = useState(''); const [codeSearch, setCodeSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(codeSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [codeSearch]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'redemptions' | 'audit'>('list');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [selectedPromoCode, setSelectedPromoCode] = useState<string>('');
  const [redemptionsPage, setRedemptionsPage] = useState(1);
  const [redemptionsSorting, setRedemptionsSorting] = useState<SortingState>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [formData, setFormData] = useState<FormState>(newFormState); const [formError, setFormError] = useState('');

  // ── Queries ──────────────────────────────────────────────────────
  const { data: stats } = useQuery<PromoStatsSummary>({
    queryKey: ['admin', 'promo-codes', 'stats'],
    queryFn: () => getPromoCodeStats(),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const { data: result, isPending, isFetching } = useQuery<PaginatedPromoCodes>({
    queryKey: ['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }],
    queryFn: () => getPromoCodes({ page, limit: PAGE_SIZE, status: statusFilter || undefined, code: debouncedSearch || undefined }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const { data: redemptionsResult, isPending: isRedemptionsPending, isFetching: isRedemptionsFetching } = useQuery<PaginatedRedemptions>({
    queryKey: ['admin', 'promo-codes', selectedPromoId, 'redemptions', redemptionsPage],
    queryFn: () => getPromoRedemptions(selectedPromoId!, redemptionsPage, 20),
    enabled: activeTab === 'redemptions' && !!selectedPromoId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const { data: auditLogs, isPending: isAuditPending, isFetching: isAuditFetching } = useQuery<PromoAuditLog[]>({
    queryKey: ['admin', 'promo-codes', selectedPromoId, 'audit'],
    queryFn: () => getPromoAuditLogs(selectedPromoId!),
    enabled: activeTab === 'audit' && !!selectedPromoId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const promos = useMemo(() => result?.data ?? [], [result]);
  const redemptions = useMemo(() => redemptionsResult?.data ?? [], [redemptionsResult]);
  const totalPages = result?.totalPages ?? 1;
  const totalRedemptionsPages = redemptionsResult?.totalPages ?? 1;

  // ── Mutations ────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updatePromoCodeStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'promo-codes'] });
      const prev = queryClient.getQueryData<PaginatedPromoCodes>(['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }]);
      queryClient.setQueryData(['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }], (old: PaginatedPromoCodes | undefined) =>
        old ? { ...old, data: old.data.map((p) => (p.id === id ? { ...p, status: status as PromoCode['status'] } : p)) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }], ctx.prev);
      toasts.error('Failed');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'promo-codes'] }); toasts.success('Status updated'); },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archivePromoCode(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'promo-codes'] });
      const prev = queryClient.getQueryData<PaginatedPromoCodes>(['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }]);
      queryClient.setQueryData(['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }], (old: PaginatedPromoCodes | undefined) =>
        old ? { ...old, data: old.data.map((p) => (p.id === id ? { ...p, status: 'ARCHIVED' as const } : p)) } : old
      );
      return { prev };
    },
    onError: (_e, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'promo-codes', { page, status: statusFilter, code: debouncedSearch }], ctx.prev);
      toasts.error('Failed');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'promo-codes'] }); queryClient.invalidateQueries({ queryKey: ['admin', 'promo-codes', 'stats'] }); toasts.success('Promo code archived'); },
  });
  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string; input: CreatePromoCodeInput }) => data.id ? updatePromoCode(data.id, data.input as UpdatePromoCodeInput) : createPromoCode(data.input),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'promo-codes'] }); queryClient.invalidateQueries({ queryKey: ['admin', 'promo-codes', 'stats'] }); setShowCreateModal(false); setEditingPromo(null); setFormData(newFormState()); toasts.success(editingPromo ? 'Updated' : 'Created'); },
    onError: () => toasts.error('Failed'),
  });

  // ── Handlers ─────────────────────────────────────────────────────
  const openCreate = useCallback(() => { setEditingPromo(null); setFormData(newFormState()); setFormError(''); setShowCreateModal(true); }, []);
  const openEdit = useCallback((promo: PromoCode) => { setEditingPromo(promo); setFormData({ code: promo.code, name: promo.name, description: promo.description ?? '', discountType: promo.discountType, discountValueMinor: String(promo.discountValueMinor), discountPercentBps: promo.discountPercentBps != null ? String(promo.discountPercentBps) : '', maxDiscountMinor: promo.maxDiscountMinor != null ? String(promo.maxDiscountMinor) : '', minBookingAmountMinor: promo.minBookingAmountMinor != null ? String(promo.minBookingAmountMinor) : '', currency: promo.currency ?? '', startsAt: promo.startsAt ? promo.startsAt.slice(0, 16) : '', endsAt: promo.endsAt ? promo.endsAt.slice(0, 16) : '', totalUsageLimit: promo.totalUsageLimit != null ? String(promo.totalUsageLimit) : '', perUserLimit: promo.perUserLimit != null ? String(promo.perUserLimit) : '', firstBookingOnly: promo.firstBookingOnly, customerType: promo.customerType, productTypes: promo.productTypes ?? [], isPublic: promo.isPublic, eligibleRoutes: (promo.eligibleRoutes ?? []).join(', '), eligibleAirlines: (promo.eligibleAirlines ?? []).join(', ') }); setFormError(''); }, []);
  const handleSave = useCallback(() => { setFormError(''); if (!formData.code.trim()) { setFormError('Code required'); return; } if (!formData.name.trim()) { setFormError('Name required'); return; } if (!formData.discountValueMinor || Number(formData.discountValueMinor) <= 0) { setFormError('Discount > 0 required'); return; } saveMutation.mutate({ id: editingPromo?.id, input: toCreateInput(formData) }); }, [formData, editingPromo, saveMutation]);
  const handleStatusChange = useCallback((id: string, status: string) => statusMutation.mutate({ id, status }), [statusMutation]);
  const [archiveTarget, setArchiveTarget] = useState<PromoCode | null>(null);
  const handleArchive = useCallback((id: string, code: string) => { setArchiveTarget(promos?.find((p) => p.id === id) ?? ({ id, code } as PromoCode)); }, [promos]);
  const confirmArchive = useCallback(() => {
    if (!archiveTarget) return;
    archiveMutation.mutate(archiveTarget.id, { onSettled: () => setArchiveTarget(null) });
  }, [archiveMutation, archiveTarget]);
  const openRedemptions = useCallback((id: string, code: string) => { setSelectedPromoId(id); setSelectedPromoCode(code); setRedemptionsPage(1); setActiveTab('redemptions'); }, []);
  const setProductType = useCallback((type: string, checked: boolean) => { setFormData((prev) => ({ ...prev, productTypes: checked ? [...prev.productTypes, type] : prev.productTypes.filter((t) => t !== type) })); }, []);

  // ── Main columns ─────────────────────────────────────────────────
  const columns = useMemo((): ColumnDef<PromoCode>[] => [
    { id: 'code', header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />, accessorKey: 'code', cell: ({ getValue }) => <span className="font-mono text-sm font-semibold text-foreground">{getValue<string>()}</span> },
    { id: 'name', header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />, accessorKey: 'name', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span> },
    { id: 'status', header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, accessorKey: 'status', cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status] ?? 'secondary'} className="gap-1.5"><span className={cn('inline-block h-1.5 w-1.5 rounded-full', row.original.status === 'ACTIVE' ? 'bg-success' : row.original.status === 'PAUSED' ? 'bg-warning' : row.original.status === 'EXPIRED' ? 'bg-destructive' : 'bg-muted-foreground/40')} />{row.original.status.charAt(0) + row.original.status.slice(1).toLowerCase()}</Badge> },
    { id: 'discount', header: ({ column }) => <DataTableColumnHeader column={column} title="Discount" />, accessorKey: 'discountValueMinor', cell: ({ row }) => (<span className="text-sm font-medium text-foreground">{formatDiscount(row.original, decimalsMap)}{row.original.discountType === 'PERCENTAGE' && row.original.maxDiscountMinor != null ? <span className="ml-1 text-xs text-muted-foreground">(max {formatCurrencyWithCode(minorToMajor(row.original.maxDiscountMinor, row.original.currency ?? 'USD', decimalsMap), row.original.currency ?? 'USD', decimalsMap)})</span> : null}</span>) },
    { id: 'usage', header: 'Usage', accessorKey: '_count.redemptions', cell: ({ row }) => (<button onClick={() => openRedemptions(row.original.id, row.original.code)} className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:bg-accent" title="View redemptions">{row.original._count.redemptions}{row.original.totalUsageLimit != null && <span className="text-muted-foreground/60"> / {row.original.totalUsageLimit}</span>}</button>), enableSorting: false },
    { id: 'createdAt', header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />, accessorKey: 'createdAt', cell: ({ getValue }) => <span className="text-sm tabular-nums text-muted-foreground">{new Date(getValue<string>()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span> },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          {hasPermission(PermissionCode.PROMO_CODES_UPDATE) && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(row.original)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
          {hasPermission(PermissionCode.PROMO_CODES_UPDATE) && row.original.status !== 'ARCHIVED' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Change status"><Settings2 className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Set status</DropdownMenuLabel>
                {['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'].filter((s) => s !== row.original.status).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => handleStatusChange(row.original.id, s)}
                    className={cn('cursor-pointer', s === 'ACTIVE' && 'text-success-600 focus:text-success-700 dark:text-success-400')}
                  >
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {hasPermission(PermissionCode.PROMO_CODES_DELETE) && row.original.status !== 'ARCHIVED' && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleArchive(row.original.id, row.original.code)} title="Archive"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ], [hasPermission, openEdit, handleStatusChange, handleArchive, openRedemptions, decimalsMap]);

  const table = useReactTable({ data: promos, columns, state: { sorting, pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE } }, onSortingChange: setSorting, onPaginationChange: (updater) => { const next = typeof updater === 'function' ? updater({ pageIndex: page - 1, pageSize: PAGE_SIZE }) : updater; setPage(next.pageIndex + 1); }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), manualPagination: true, pageCount: totalPages });

  // ── Redemptions columns ──────────────────────────────────────────
  const redemptionColumns = useMemo((): ColumnDef<PromoRedemption>[] => [
    { id: 'user', header: 'User', accessorKey: 'userId', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>() ?? '—'}</span>, enableSorting: false },
    { id: 'bookingId', header: 'Booking ID', accessorKey: 'bookingId', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>, enableSorting: false },
    { id: 'bookingType', header: 'Type', accessorKey: 'bookingType', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span>, enableSorting: false },
    { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ getValue }) => <Badge variant={REDEMPTION_VARIANT[getValue<string>()] ?? 'secondary'} className="gap-1">{getValue<string>()}</Badge>, enableSorting: false },
    { id: 'discount', header: 'Discount', accessorKey: 'discountMinor', cell: ({ row }) => <span className="text-sm font-medium tabular-nums text-foreground">{formatCurrencyWithCode(minorToMajor(row.original.discountMinor, row.original.currency, decimalsMap), row.original.currency, decimalsMap)}</span>, enableSorting: false },
    { id: 'subtotal', header: 'Subtotal', accessorKey: 'bookingSubtotalMinor', cell: ({ row }) => <span className="text-sm tabular-nums text-muted-foreground">{formatCurrencyWithCode(minorToMajor(row.original.bookingSubtotalMinor, row.original.currency, decimalsMap), row.original.currency, decimalsMap)}</span>, enableSorting: false },
    { id: 'createdAt', header: 'Date', accessorKey: 'createdAt', cell: ({ row }) => <span className="text-sm text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>, enableSorting: false },
  ], [decimalsMap]);

  const redemptionTable = useReactTable({ data: redemptions, columns: redemptionColumns, state: { sorting: redemptionsSorting, pagination: { pageIndex: redemptionsPage - 1, pageSize: 20 } }, onSortingChange: setRedemptionsSorting, onPaginationChange: (updater) => { const next = typeof updater === 'function' ? updater({ pageIndex: redemptionsPage - 1, pageSize: 20 }) : updater; setRedemptionsPage(next.pageIndex + 1); }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), manualPagination: true, pageCount: totalRedemptionsPages });

  // ── Audit columns ─────────────────────────────────────────────────
  const auditColumns = useMemo((): ColumnDef<PromoAuditLog>[] => [
    { id: 'action', header: 'Action', accessorKey: 'action', cell: ({ getValue }) => { const a = getValue<string>(); return <Badge variant={a.includes('CREATE') ? 'success' : a.includes('UPDATE') || a.includes('STATUS') ? 'info' : a.includes('ARCHIVE') || a.includes('DELETE') ? 'error' : 'secondary'}>{a}</Badge>; } },
    { id: 'performedBy', header: 'Performed By', accessorKey: 'performedBy', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>() ?? 'System'}</span>, enableSorting: false },
    { id: 'details', header: 'Details', accessorKey: 'details', cell: ({ row }) => <pre className="max-w-md overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(row.original.details, null, 2)}</pre>, enableSorting: false },
    { id: 'createdAt', header: 'Date', accessorKey: 'createdAt', cell: ({ row }) => <span className="text-sm tabular-nums text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span> },
  ], []);

  const auditTable = useReactTable({ data: auditLogs ?? [], columns: auditColumns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Promo Codes" description="Manage discount codes and track redemptions." />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardOverviewCardV2 data={{ value: stats.totalCodes }} title="Total" period="All codes" icon={<TicketPercent className="h-5 w-5" />} iconColor="hsl(var(--primary))" action={null} />
          <DashboardOverviewCardV2 data={{ value: stats.activeCodes }} title="Active" period="Currently active" icon={<TicketPercent className="h-5 w-5" />} iconColor="hsl(var(--chart-2))" action={null} />
          <DashboardOverviewCardV2 data={{ value: stats.totalRedemptions }} title="Redemptions" period="Total uses" icon={<ReceiptText className="h-5 w-5" />} iconColor="hsl(var(--chart-1))" action={null} />
          <DashboardOverviewCardV2 data={{ value: stats.totalDiscountMinor != null && stats.totalDiscountCurrency ? formatCurrencyWithCode(minorToMajor(stats.totalDiscountMinor, stats.totalDiscountCurrency, decimalsMap), stats.totalDiscountCurrency, decimalsMap) : undefined }} title="Total Discount" period="Amount saved" icon={<TicketPercent className="h-5 w-5" />} iconColor="hsl(var(--chart-4))" action={null} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:border-ring focus:outline-none">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by code…" value={codeSearch} onChange={(e) => { setCodeSearch(e.target.value); setPage(1); }} className="h-9 w-56 pl-9" />
          </div>
        </div>
        {hasPermission(PermissionCode.PROMO_CODES_CREATE) && <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" />Add Promo Code</Button>}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {[{ key: 'list' as const, label: 'Promo Codes' }, { key: 'redemptions' as const, label: 'Redemptions' }, { key: 'audit' as const, label: 'Audit Log' }].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn('whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors', activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}>{tab.label}</button>
          ))}
        </nav>
      </div>

      {/* ── List Tab ── */}
      {activeTab === 'list' && (
        <DashboardCard title="Promo Codes" period={result?.total != null ? `${result.total} codes` : undefined} action={<DashboardCardActionsDropdown />} size="lg" className="admin-table-card" contentClassName="gap-y-0">
          <div className={cn('admin-table-viewport transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
            <Table>
              <TableHeader>{table.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}</TableRow>)}</TableHeader>
              <TableBody>
                {isPending ? <AdminTableSkeleton rows={8} columns={7} shortColumns={[3, 4, 5]} />
                  : promos.length === 0 ? <TableRow><TableCell colSpan={7} className="h-64 text-center"><div className="flex flex-col items-center gap-3"><TicketPercent className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-muted-foreground">No promo codes found</p></div></TableCell></TableRow>
                  : table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
              </TableBody>
            </Table>
          </div>
          {!isPending && (result?.total ?? 0) > PAGE_SIZE && <div className="border-t border-border px-6 py-3"><DataTablePagination table={table} /></div>}
        </DashboardCard>
      )}

      {/* ── Redemptions Tab ── */}
      {activeTab === 'redemptions' && (
        <div className="space-y-4">
          {!selectedPromoId ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center"><p className="text-sm text-muted-foreground">Select a promo code from the list to view its redemptions.</p></div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Redemptions for</span><span className="font-mono font-semibold text-foreground">{selectedPromoCode}</span></div>
              <DashboardCard title="Redemptions" period={redemptionsResult?.total != null ? `${redemptionsResult.total} total` : undefined} size="lg" className="admin-table-card" contentClassName="gap-y-0">
                <div className={cn('admin-table-viewport transition-opacity duration-200', isRedemptionsFetching && !isRedemptionsPending && 'opacity-60')}>
                  <Table>
                    <TableHeader>{redemptionTable.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}</TableRow>)}</TableHeader>
                    <TableBody>
                      {isRedemptionsPending ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 120 : j === 1 ? 100 : j === 3 ? 80 : 70 }} /></TableCell>)}</TableRow>)
                        : redemptions.length === 0 ? <TableRow><TableCell colSpan={7} className="h-48 text-center"><p className="text-sm text-muted-foreground">No redemptions found.</p></TableCell></TableRow>
                        : redemptionTable.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
                    </TableBody>
                  </Table>
                </div>
                {(redemptionsResult?.total ?? 0) > 20 && <div className="border-t border-border px-6 py-3"><DataTablePagination table={redemptionTable} /></div>}
              </DashboardCard>
            </>
          )}
        </div>
      )}

      {/* ── Audit Tab ── */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {!selectedPromoId ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center"><p className="text-sm text-muted-foreground">Select a promo code from the list to view its audit log.</p></div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Audit log for</span><span className="font-mono font-semibold text-foreground">{selectedPromoCode}</span></div>
              <DashboardCard title="Audit Log" size="lg" className="admin-table-card" contentClassName="gap-y-0">
                <div className={cn('admin-table-viewport transition-opacity duration-200', isAuditFetching && !isAuditPending && 'opacity-60')}>
                  <Table>
                    <TableHeader>{auditTable.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}</TableRow>)}</TableHeader>
                    <TableBody>
                      {isAuditPending ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) => <TableCell key={j}><div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 100 : j === 1 ? 120 : j === 2 ? 200 : 90 }} /></TableCell>)}</TableRow>)
                        : (auditLogs ?? []).length === 0 ? <TableRow><TableCell colSpan={4} className="h-48 text-center"><p className="text-sm text-muted-foreground">No audit entries.</p></TableCell></TableRow>
                        : auditTable.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
                    </TableBody>
                  </Table>
                </div>
              </DashboardCard>
            </>
          )}
        </div>
      )}

      {/* ── Archive Confirm ── */}
      {archiveTarget && (
        <DeleteConfirm
          open
          count={1}
          noun={`promo code (${archiveTarget.code})`}
          loading={archiveMutation.isPending}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={confirmArchive}
        />
      )}

      {/* ── Create/Edit Modal ── */}
      {(showCreateModal || !!editingPromo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowCreateModal(false); setEditingPromo(null); }}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-foreground">{editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{editingPromo ? `Editing ${editingPromo.code}` : 'Add a new promo code.'}</p>
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><label className="text-sm font-medium">Code *</label><input type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="e.g. SUMMER20" className={`${inputClass} font-mono`} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Name *</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Summer Sale" className={inputClass} /></div>
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Description</label><textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} className={inputClass} /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5"><label className="text-sm font-medium">Type *</label><select value={formData.discountType} onChange={(e) => setFormData({ ...formData, discountType: e.target.value as 'PERCENTAGE' | 'FIXED' })} className={inputClass}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed Amount</option></select></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">{formData.discountType === 'PERCENTAGE' ? 'Discount % *' : 'Amount (cents) *'}</label><input type="number" min="0" value={formData.discountValueMinor} onChange={(e) => setFormData({ ...formData, discountValueMinor: e.target.value })} className={inputClass} /></div>
                {formData.discountType === 'PERCENTAGE' && <div className="space-y-1.5"><label className="text-sm font-medium">Max (cents)</label><input type="number" min="0" value={formData.maxDiscountMinor} onChange={(e) => setFormData({ ...formData, maxDiscountMinor: e.target.value })} className={inputClass} /></div>}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5"><label className="text-sm font-medium">Min Booking</label><input type="number" min="0" value={formData.minBookingAmountMinor} onChange={(e) => setFormData({ ...formData, minBookingAmountMinor: e.target.value })} className={inputClass} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Currency</label><input type="text" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })} placeholder="USD" className={inputClass} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Customer Type</label><select value={formData.customerType} onChange={(e) => setFormData({ ...formData, customerType: e.target.value })} className={inputClass}><option value="ALL">All</option><option value="CUSTOMER">Customer</option><option value="AGENT">Agent</option></select></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><label className="text-sm font-medium">Starts At</label><input type="datetime-local" value={formData.startsAt} onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })} className={inputClass} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Ends At</label><input type="datetime-local" value={formData.endsAt} onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })} className={inputClass} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><label className="text-sm font-medium">Usage Limit</label><input type="number" min="0" value={formData.totalUsageLimit} onChange={(e) => setFormData({ ...formData, totalUsageLimit: e.target.value })} placeholder="Unlimited" className={inputClass} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Per User Limit</label><input type="number" min="0" value={formData.perUserLimit} onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })} placeholder="Unlimited" className={inputClass} /></div>
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Product Types</label><div className="flex gap-4">{[{ k: 'flights', l: 'Flights' }, { k: 'hotels', l: 'Hotels' }].map((t) => <label key={t.k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.productTypes.includes(t.k)} onChange={(e) => setProductType(t.k, e.target.checked)} className="rounded border-input text-primary focus:ring-primary" />{t.l}</label>)}</div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><label className="text-sm font-medium">Eligible Routes</label><input type="text" value={formData.eligibleRoutes} onChange={(e) => setFormData({ ...formData, eligibleRoutes: e.target.value })} placeholder="DXB-LHR, JFK-CDG" className={inputClass} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Eligible Airlines</label><input type="text" value={formData.eligibleAirlines} onChange={(e) => setFormData({ ...formData, eligibleAirlines: e.target.value })} placeholder="EK, BA" className={inputClass} /></div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.firstBookingOnly} onChange={(e) => setFormData({ ...formData, firstBookingOnly: e.target.checked })} className="rounded border-input text-primary focus:ring-primary" />First booking only</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.isPublic} onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })} className="rounded border-input text-primary focus:ring-primary" />Public</label>
              </div>
            </div>
            {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
            {saveMutation.isError && <p className="mt-3 text-sm text-destructive">{(saveMutation.error as any)?.message ?? 'Failed'}</p>}
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowCreateModal(false); setEditingPromo(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : editingPromo ? 'Save Changes' : 'Create Promo Code'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPromoCodesPage() {
  return <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}><RequirePagePermission permissions={[PermissionCode.PROMO_CODES_READ]}><PromoCodesPageInner /></RequirePagePermission></Suspense>;
}
