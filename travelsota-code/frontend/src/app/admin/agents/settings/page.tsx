'use client';

import { Suspense, useState } from 'react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Users, UserCheck, Clock } from 'lucide-react';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import { getAgents, type AgentUser } from '@/features/admin/api/admin-agents';
import { useToast } from '@/hooks/useToast';

function AgentSettingsPageInner() {
  const toasts = useToast();
  const [defaultCommission, setDefaultCommission] = useState('5');
  const [defaultCreditLimit, setDefaultCreditLimit] = useState('1000');
  const [defaultFlightMarkup, setDefaultFlightMarkup] = useState('3');
  const [defaultHotelMarkup, setDefaultHotelMarkup] = useState('5');
  const [autoApprove, setAutoApprove] = useState(false);

  const { data: agents } = useQuery<AgentUser[]>({
    queryKey: ['admin', 'agents'],
    queryFn: () => getAgents(),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Placeholder — will connect to a dedicated settings endpoint later
      return { success: true };
    },
    onSuccess: () => {
      toasts.success('Agent settings saved');
    },
    onError: () => toasts.error('Failed to save settings'),
  });

  const stats = {
    total: agents?.length ?? 0,
    approved: agents?.filter((a) => a.agentProfile?.isApproved).length ?? 0,
    pending: agents?.filter((a) => !a.agentProfile?.isApproved).length ?? 0,
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Agent Settings" />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <DashboardOverviewCardV2 data={{ value: stats.total }} title="Total Agents" period="All agents" icon={<Users className="h-4 w-4" />} iconColor="hsl(var(--primary))" action={null} />
        <DashboardOverviewCardV2 data={{ value: stats.approved }} title="Approved" period="Verified agents" icon={<UserCheck className="h-4 w-4" />} iconColor="hsl(var(--chart-2))" action={null} />
        <DashboardOverviewCardV2 data={{ value: stats.pending }} title="Pending" period="Need approval" icon={<Clock className="h-4 w-4" />} iconColor="hsl(var(--chart-3))" action={null} />
      </div>

      {/* Default values form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Default Agent Configuration</h3>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Default values applied to newly created agent accounts.</p>
        <div className="mt-5 grid max-w-lg gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Default Commission Rate (%)</label>
            <input type="number" value={defaultCommission} onChange={(e) => setDefaultCommission(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Default Credit Limit ($)</label>
            <input type="number" value={defaultCreditLimit} onChange={(e) => setDefaultCreditLimit(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Default Flight Markup (%)</label>
            <input type="number" value={defaultFlightMarkup} onChange={(e) => setDefaultFlightMarkup(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Default Hotel Markup (%)</label>
            <input type="number" value={defaultHotelMarkup} onChange={(e) => setDefaultHotelMarkup(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input type="checkbox" id="autoApprove" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-teal-600 focus:ring-brand-teal-500 dark:border-gray-600" />
          <label htmlFor="autoApprove" className="text-sm text-gray-700 dark:text-gray-300">Auto-approve new agent registrations</label>
        </div>
        <div className="mt-5">
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
            className="cursor-pointer rounded-xl bg-brand-teal-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentSettingsPage() {
  return (
    <Suspense fallback={null}>
      <RequirePagePermission permissions={[PermissionCode.AGENTS_WRITE]}>
        <AgentSettingsPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
