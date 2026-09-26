'use client';

import { Suspense, useState, useCallback, useMemo, memo } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { suppressDuplicateSuccess } from '@/features/notifications/lib/actor-event-dedupe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Modal } from '@/components/ui/modal';
import { PlusIcon, PencilIcon, TrashBinIcon, LockIcon } from '@/icons';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getRoles, deleteRole, createRole, getRoleUserCount, type RoleEntity } from '@/features/admin/api/admin-users';
import { useToast } from '@/hooks/useToast';

function RolesPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<{ role: RoleEntity; count: number } | null>(null);
  const [checkingUsers, setCheckingUsers] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', isProtected: false });
  const [formError, setFormError] = useState('');

  const { data: roles, isPending } = useQuery<RoleEntity[]>({
    queryKey: ['admin', 'roles'],
    queryFn: () => getRoles(),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const prev = queryClient.getQueryData<RoleEntity[]>(['admin', 'roles']);
      if (prev) {
        queryClient.setQueryData<RoleEntity[]>(['admin', 'roles'], (old) => old?.filter((r) => r.id !== id) ?? []);
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'roles'], ctx.prev);
      toasts.error('Failed to delete role', 'Please try again.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      toasts.success('Role deleted', 'The role has been removed successfully.');
    },
  });

  const toasts = useToast();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; isProtected?: boolean }) => createRole(data),
    onMutate: async (data) => {
      const tempId = `temp-${Date.now()}`;
      const newRole: RoleEntity = {
        id: tempId, name: data.name, description: data.description ?? null,
        isDefault: false, isProtected: data.isProtected ?? false, priority: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const prev = queryClient.getQueryData<RoleEntity[]>(['admin', 'roles']);
      queryClient.setQueryData<RoleEntity[]>(['admin', 'roles'], (old) => [...(old ?? []), newRole]);
      return { prev, tempId };
    },
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setShowCreateModal(false);
      setFormData({ name: '', description: '', isProtected: false });
      // Backend emits a live 'role.updated' notification for this action —
      // suppress the local toast to avoid the double notification.
      suppressDuplicateSuccess('role.updated', _data.id);
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'roles'], ctx.prev);
      if (ctx?.tempId) {
        queryClient.setQueryData<RoleEntity[]>(['admin', 'roles'], (old) => old?.filter((r) => r.id !== ctx.tempId) ?? []);
      }
      toasts.error('Failed to create role', (_err as any)?.message ?? 'Please try again.');
    },
  });

  const handleDelete = useCallback(async (role: RoleEntity) => {
    if (role.name === 'super_admin') { toasts.error('The super_admin role cannot be deleted.'); return; }
    setCheckingUsers(true);
    try {
      const res = await getRoleUserCount(role.id);
      if (res.count > 0) {
        setDeleteWarning({ role, count: res.count });
      } else {
        if (await confirmDialog({ title: `Delete role "${role.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete' })) {
          deleteMutation.mutate(role.id);
        }
      }
    } catch {
      if (await confirmDialog({ title: `Delete role "${role.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete' })) {
        deleteMutation.mutate(role.id);
      }
    } finally {
      setCheckingUsers(false);
    }
  }, [deleteMutation]);

  const handleEdit = useCallback((id: string) => {
    router.push(`/admin/roles/${id}`);
  }, [router]);

  const handleCreate = useCallback(async () => {
    setFormError('');
    if (!formData.name.trim()) { setFormError('Role name is required'); return; }
    createMutation.mutate({ name: formData.name.trim(), description: formData.description.trim() || undefined, isProtected: formData.isProtected });
  }, [formData, createMutation]);

  const { superAdmin, staffRoles, agentRoles } = useMemo(() => {
    const list = roles ?? [];
    return {
      superAdmin: list.find((r) => r.name === 'super_admin') ?? null,
      staffRoles: list.filter((r) => r.name !== 'super_admin' && !r.name.endsWith('_agent')),
      agentRoles: list.filter((r) => r.name.endsWith('_agent')),
    };
  }, [roles]);
  const hasRoles = !isPending && (superAdmin || staffRoles.length > 0 || agentRoles.length > 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Roles & Permissions"
        description="Define roles and assign permissions to control user access."
        actions={
          hasPermission(PermissionCode.USERS_MANAGE_ROLES) && (
            <button onClick={() => setShowCreateModal(true)} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600">
              <PlusIcon className="size-5" /> Create Role
            </button>
          )
        }
      />

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : !hasRoles ? (
        <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-gray-700">
          <LockIcon className="mb-3 size-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No roles defined</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Super Admin ──────────────────────────────── */}
          {superAdmin && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <svg className="size-3.5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Super Admin</span>
              </div>
              <RoleCard
                role={superAdmin}
                locked={true}
                onEdit={hasPermission(PermissionCode.USERS_MANAGE_ROLES) ? handleEdit : undefined}
              />
            </div>
          )}

          {/* ── Staff Roles ──────────────────────────────── */}
          {staffRoles.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <svg className="size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Staff Roles</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{staffRoles.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {staffRoles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={hasPermission(PermissionCode.USERS_MANAGE_ROLES) ? handleEdit : undefined}
                    onDelete={hasPermission(PermissionCode.USERS_MANAGE_ROLES) ? handleDelete : undefined}
                    deleteDisabled={checkingUsers}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Agent Roles ──────────────────────────────── */}
          {agentRoles.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <svg className="size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16v-2" /><path d="M7.5 19.1l3 1.73 3-1.73" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Agent Roles</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{agentRoles.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agentRoles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={hasPermission(PermissionCode.USERS_MANAGE_ROLES) ? handleEdit : undefined}
                    onDelete={hasPermission(PermissionCode.USERS_MANAGE_ROLES) ? handleDelete : undefined}
                    deleteDisabled={checkingUsers}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <Modal adminSurface isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create Role</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add a new role to the system.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Protected</label>
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.isProtected} 
                      onChange={(e) => setFormData({ ...formData, isProtected: e.target.checked })}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-teal-300 dark:focus:ring-brand-teal-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-teal-600"></div>
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    (Prevents other roles from editing/deleting this role)
                  </span>
                </div>
              </div>
            </div>

            {formError && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{formError}</p>}
            {createMutation.isError && <p className="mt-3 text-sm text-error-600">{(createMutation.error as any)?.message ?? 'Failed to create role'}</p>}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {createMutation.isPending ? 'Creating…' : 'Create Role'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Warning Modal */}
      {deleteWarning && (
        <Modal adminSurface isOpen={!!deleteWarning} onClose={() => setDeleteWarning(null)}>
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cannot delete role</h2>
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-warning-50 p-4 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
              <svg className="mt-0.5 size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              <p>
                <strong>{deleteWarning?.count}</strong> user(s) are assigned the role{' '}
                <strong>&quot;{deleteWarning?.role.name}&quot;</strong>.<br />
                Reassign them before deleting this role.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => router.push('/admin/users/staff')}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600"
              >
                Manage Staff Users
              </button>
              <button
                onClick={() => setDeleteWarning(null)}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Role Card Component ────────────────────────────────

interface RoleCardProps {
  role: RoleEntity;
  locked?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (role: RoleEntity) => void;
  deleteDisabled?: boolean;
}

const RoleCard = memo(function RoleCard({ role, locked, onEdit, onDelete, deleteDisabled }: RoleCardProps) {
  return (
    <div className={`group relative rounded-2xl border p-5 transition-all ${
      locked
        ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/10'
        : 'border-gray-200 bg-white hover:shadow-sm dark:border-gray-700 dark:bg-gray-900'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-base font-semibold ${locked ? 'text-amber-800 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
              {role.name.replace(/_/g, ' ')}
            </h3>
            {locked && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <svg className="inline-block size-3 align-text-bottom mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Locked
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{role.description ?? 'No description'}</p>
        </div>
        <div className="flex items-center gap-0.5">
          {onEdit && (
            <button onClick={() => onEdit(role.id)}
              className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-brand-teal-600 group-hover:opacity-100 dark:hover:bg-gray-800 dark:hover:text-brand-teal-400">
              <PencilIcon className="size-5" />
            </button>
          )}
          {onDelete && !locked && (
            <button onClick={() => onDelete(role)} disabled={deleteDisabled}
              className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-error-600 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-gray-800 dark:hover:text-error-400">
              <TrashBinIcon className="size-5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
        {role.isDefault && <span className="rounded-md bg-brand-teal-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">Default</span>}
        {role.isProtected && <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-red-600 dark:bg-red-900/30 dark:text-red-400">Protected</span>}
        {role.name.endsWith('_agent') && (
          <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">Agent</span>
        )}
        {!role.name.endsWith('_agent') && role.name !== 'super_admin' && (
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">Staff</span>
        )}
      </div>
    </div>
  );
});

export default function AdminRolesPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.USERS_MANAGE_ROLES]}>
        <RolesPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
