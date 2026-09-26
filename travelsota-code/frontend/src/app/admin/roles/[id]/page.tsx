'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { getRole, getPermissions, updateRole, type RoleWithPermissions, type PermissionGroup } from '@/features/admin/api/admin-users';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { ChevronLeftIcon, CheckCircleIcon } from '@/icons';
import { useToast } from '@/hooks/useToast';

function RoleForm({ role, permissionGroups }: { role: RoleWithPermissions; permissionGroups?: PermissionGroup[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toasts = useToast();
  const { id } = useParams<{ id: string }>();

  const [editedName, setEditedName] = useState(role.name);
  const [editedDescription, setEditedDescription] = useState(role.description ?? '');
  const [editedIsProtected, setEditedIsProtected] = useState(role.isProtected);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set(role.permissions));
  const [isDirty, setIsDirty] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string; isProtected?: boolean; permissionIds?: string[] }) => updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'role', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] });
      setIsDirty(false);
      toasts.success('Role updated', 'Permissions and role details saved successfully.');
    },
    onError: (_err) => {
      toasts.error('Failed to update role', (_err as any)?.message ?? 'Please try again.');
    },
  });

  const togglePerm = (code: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
    setIsDirty(true);
  };

  const selectAllInGroup = (perms: { code: string }[], add: boolean) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      for (const p of perms) { if (add) next.add(p.code); else next.delete(p.code); }
      return next;
    });
    setIsDirty(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      name: editedName,
      description: editedDescription || undefined,
      isProtected: editedIsProtected,
      permissionIds: Array.from(selectedPerms),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => router.push('/admin/roles')} className="mb-3 inline-flex cursor-pointer items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ChevronLeftIcon className="size-5" /> Back to Roles
        </button>
        <PageBreadcrumb pageTitle={role.name} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Role metadata */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Role Details</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
              <input type="text" value={editedName} onChange={(e) => { setEditedName(e.target.value); setIsDirty(true); }}
                disabled={role.name === 'super_admin'}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
              <textarea value={editedDescription} onChange={(e) => { setEditedDescription(e.target.value); setIsDirty(true); }}
                disabled={role.name === 'super_admin'} rows={3}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Protected</label>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={editedIsProtected} 
                    onChange={(e) => { setEditedIsProtected(e.target.checked); setIsDirty(true); }}
                    disabled={role.name === 'super_admin'}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-teal-300 dark:focus:ring-brand-teal-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"></div>
                </label>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {role.name === 'super_admin' ? '(Cannot be modified)' : '(Prevents other roles from editing/deleting this role)'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {role.isDefault && <span className="rounded-md bg-brand-teal-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">Default</span>}
              {role.isProtected && <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-red-600 dark:bg-red-900/30 dark:text-red-400">Protected</span>}
            </div>
          </div>

          {isDirty && (
            <div className="mt-6">
              <button onClick={handleSave} disabled={updateMutation.isPending}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Permission matrix */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900 lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Permissions</h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Toggle permissions to grant or revoke access for this role.</p>

          <div className="mt-4 space-y-6">
            {permissionGroups?.map((group) => {
              const allSelected = group.permissions.every((p) => selectedPerms.has(p.code));
              return (
                <div key={group.key}>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{group.label}</h4>
                    {role.name !== 'super_admin' && (
                      <button onClick={() => selectAllInGroup(group.permissions, !allSelected)}
                        className="cursor-pointer text-xs font-medium text-brand-teal-500 hover:text-brand-teal-600 dark:text-brand-teal-400 dark:hover:text-brand-teal-300">
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {group.permissions.map((perm) => {
                      const checked = selectedPerms.has(perm.code);
                      return (
                        <button key={perm.id} onClick={() => { if (role.name !== 'super_admin') togglePerm(perm.code); }}
                          disabled={role.name === 'super_admin'}
                          className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                            checked
                              ? 'border-brand-teal-200 bg-brand-teal-50 text-brand-teal-700 dark:border-brand-teal-700 dark:bg-brand-teal-900/20 dark:text-brand-teal-300'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-750'
                          }`}>
                          <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            checked
                              ? 'border-brand-teal-500 bg-brand-teal-500 text-white'
                              : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                          }`}>
                            {checked && <CheckCircleIcon className="size-3" />}
                          </span>
                          <span className="leading-tight">{perm.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!permissionGroups && (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500">Loading permissions…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleDetailPageInner() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const { data: role, isPending: rolePending } = useQuery<RoleWithPermissions>({
    queryKey: ['admin', 'role', id],
    queryFn: () => getRole(id),
    enabled: !!id,
  });

  const { data: permissionGroups } = useQuery<PermissionGroup[]>({
    queryKey: ['admin', 'permissions'],
    queryFn: () => getPermissions(),
  });

  if (rolePending) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb pageTitle="Role Detail" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb pageTitle="Role Detail" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Role not found</p>
          <button onClick={() => router.push('/admin/roles')} className="mt-3 cursor-pointer text-sm text-brand-teal-500 hover:underline">Back to roles</button>
        </div>
      </div>
    );
  }

  return <RoleForm key={role.id} role={role} permissionGroups={permissionGroups} />;
}

export default function AdminRoleDetailPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.USERS_MANAGE_ROLES]}>
        <RoleDetailPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
