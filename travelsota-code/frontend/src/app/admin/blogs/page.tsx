'use client';

import { Suspense, useState, useMemo } from 'react';
import { confirmDialog } from "@/components/ui/confirm-dialog";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, FileText } from 'lucide-react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import { useAdminBlogPosts, useDeleteBlogPost } from '@/features/blog/hooks';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { useToast } from '@/hooks/useToast';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

const PAGE_SIZE = 20;

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function BlogsPageInner() {
  const router = useRouter();
  const toasts = useToast();
  const { hasPermission } = usePermissions();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: result, isPending } = useAdminBlogPosts({
    page, limit: PAGE_SIZE,
    status: (statusFilter as 'DRAFT' | 'PUBLISHED' | undefined) || undefined,
    q: search || undefined,
  });
  const deleteMutation = useDeleteBlogPost();
  const posts = useMemo(() => result?.data ?? [], [result]);
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  const columns = useMemo((): ColumnDef<(typeof posts)[number]>[] => [
    {
      id: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      accessorKey: 'title',
      cell: ({ row }) => (
        <div>
          <button
            onClick={() => router.push(`/admin/blogs/${row.original.id}`)}
            className="text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            {row.original.title}
          </button>
          <p className="mt-0.5 text-xs text-muted-foreground">/{row.original.slug}</p>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      accessorKey: 'category.name' as string,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.category?.name ?? '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorKey: 'status',
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <Badge variant={s === 'PUBLISHED' ? 'success' : 'secondary'} className="gap-1.5">
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', s === 'PUBLISHED' ? 'bg-success' : 'bg-muted-foreground/40')} />
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </Badge>
        );
      },
    },
    {
      id: 'views',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Views" />,
      accessorKey: 'viewCount',
      cell: ({ getValue }) => (
        <span className="text-sm tabular-nums text-muted-foreground">{getValue<number>()}</span>
      ),
    },
    {
      id: 'publishedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Published" />,
      accessorKey: 'publishedAt',
      cell: ({ getValue }) => (
        <span className="text-sm tabular-nums text-muted-foreground">{formatDate(getValue<string | null>())}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          {hasPermission(PermissionCode.BLOGS_WRITE) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => router.push(`/admin/blogs/${row.original.id}`)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {hasPermission(PermissionCode.BLOGS_WRITE) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (await confirmDialog({ title: `Delete post "${row.original.title}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete' }))
                  deleteMutation.mutate(row.original.id, {
                    onSuccess: () => toasts.success('Post deleted'),
                    onError: (err) => toasts.error((err as { message?: string })?.message ?? 'Failed to delete post'),
                  });
              }}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
      enableSorting: false,
    },
  ], [hasPermission, router, deleteMutation, toasts]);

  const table = useReactTable({
    data: posts,
    columns,
    state: { sorting, pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater({ pageIndex: page - 1, pageSize: PAGE_SIZE })
        : updater;
      setPage(next.pageIndex + 1);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Blog Posts"
        description="Manage blog posts and content."
        breadcrumbs={[{ label: 'Blog' }, { label: 'Posts' }]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:border-ring focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search posts…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-56 pl-9"
            />
          </div>
        </div>
        {hasPermission(PermissionCode.BLOGS_WRITE) && (
          <Link href="/admin/blogs/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              New Post
            </Link>
        )}
      </div>

      <DashboardCard
        title="All Posts"
        period={total ? `${total.toLocaleString()} posts` : undefined}
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
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 220 : j === 1 ? 100 : j === 2 ? 80 : j === 3 ? 50 : j === 4 ? 100 : 80 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No posts found</p>
                      {statusFilter || search ? (
                        <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setSearch(''); }}>
                          Clear filters
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!isPending && total > PAGE_SIZE && (
          <div className="border-t border-border px-6 py-3">
            <DataTablePagination table={table} />
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default function AdminBlogsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <RequirePagePermission permissions={[PermissionCode.BLOGS_READ]}>
        <BlogsPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
