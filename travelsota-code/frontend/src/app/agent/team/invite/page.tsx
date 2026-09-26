'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSubAgent, getAgentRoles, type CreateSubAgentPayload } from '@/features/agent/api/agent-team';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import { ArrowUpIcon } from '@/components/agent/AgentIcons';

export default function AgentCreateSubAgentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  const [form, setForm] = useState<CreateSubAgentPayload>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roleId: '',
    creditLimit: undefined,
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: roles = [] } = useQuery({
    queryKey: ['agent', 'team', 'roles'],
    queryFn: getAgentRoles,
  });

  const createMutation = useMutation({
    mutationFn: () => createSubAgent(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'team'] });
      setSuccess(true);
    },
    onError: (err: any) =>
      setError(err?.message ?? 'Failed to create sub-agent'),
  });

  if (!hasPermission(PermissionCode.AGENT_MANAGE_SUB_AGENTS)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-5xl">🔒</div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Denied</h2>
          <p className="mt-1 text-sm text-gray-500">Your plan does not include team management.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.email.trim()) { setError('Email is required'); return; }
    if (!form.password || form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (form.password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!form.roleId) { setError('Please select a role'); return; }

    createMutation.mutate();
  };

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <svg className="size-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sub-Agent Created!</h2>
        <p className="mt-2 text-sm text-gray-500">
          <strong>{form.email}</strong> can now sign in with the password you set.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => router.push('/agent/team')}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Back to Team
          </button>
          <button
            onClick={() => {
              setForm({ email: '', password: '', firstName: '', lastName: '', roleId: '', creditLimit: undefined });
              setConfirmPassword('');
              setSuccess(false);
            }}
            className="rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-teal-600"
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowUpIcon className="size-4 rotate-180" />
        Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Sub-Agent</h1>
      <p className="mt-1 text-sm text-gray-500">Add a new team member to your agency</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email *</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="subagent@example.com" required
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Password *</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min 8 characters" required minLength={8}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password *</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password" required
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">First Name</label>
            <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Last Name</label>
            <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Role *</label>
          <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option value="">Select a role</option>
            {roles.map((role: any) => (
              <option key={role.id} value={role.id}>{role.name} — {role.description}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Credit Limit ($)</label>
          <input type="number" min="0" value={form.creditLimit ?? ''}
            onChange={(e) => setForm({ ...form, creditLimit: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Uses default if empty"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button type="submit" disabled={createMutation.isPending}
            className="rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-teal-600 disabled:opacity-50">
            {createMutation.isPending ? 'Creating…' : 'Create Sub-Agent'}
          </button>
        </div>
      </form>
    </div>
  );
}
