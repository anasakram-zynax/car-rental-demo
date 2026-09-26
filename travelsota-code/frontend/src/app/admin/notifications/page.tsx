'use client';

import { useQuery } from "@tanstack/react-query";
import { Bell, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { RequirePagePermission } from "@/components/admin/permission";
import { PermissionCode } from "@/lib/permissions";
import { usePermissions } from "@/components/admin/permission/usePermissions";
import NotificationList from "@/features/notifications/components/NotificationList";
import NotificationRuleManager from "@/features/notifications/components/NotificationRuleManager";
import LiveNotificationSettings from "@/features/notifications/components/LiveNotificationSettings";
import { useUnreadNotificationCount } from "@/features/notifications/hooks";
import { getRoles } from "@/features/admin/api/admin-users";
import { DashboardCard, DashboardOverviewCardV2, DashboardCardActionsDropdown } from "@/components/dashboards/dashboard-card";
import { AdminPageHeader } from "@/components/admin/shared/AdminPageHeader";

function NotificationsPageContent() {
  const { hasPermission } = usePermissions();
  const { data: counts } = useUnreadNotificationCount();
  const { data: roles } = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: getRoles,
    staleTime: 60 * 1000,
  });

  const canManage = hasPermission(PermissionCode.NOTIFICATIONS_MANAGE);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Notifications" description="Manage notification preferences and view activity." />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DashboardOverviewCardV2 data={{ value: counts?.total ?? 0 }} title="Total Unread" period="All unread" icon={<Bell className="h-5 w-5" />} iconColor="hsl(var(--primary))" action={null} />
        <DashboardOverviewCardV2 data={{ value: counts?.critical ?? 0 }} title="Critical" period="Urgent alerts" icon={<AlertTriangle className="h-5 w-5" />} iconColor="hsl(var(--destructive))" action={null} />
        <DashboardOverviewCardV2 data={{ value: counts?.high ?? 0 }} title="High" period="Important" icon={<AlertCircle className="h-5 w-5" />} iconColor="hsl(var(--chart-3))" action={null} />
        <DashboardOverviewCardV2 data={{ value: counts?.info ?? 0 }} title="Info" period="Informational" icon={<Info className="h-5 w-5" />} iconColor="hsl(var(--chart-1))" action={null} />
      </div>

      {/* Live stack controls (moved off the floating page UI) */}
      <DashboardCard
        title="Live Notification Settings"
        period="Choose which live events float on screen"
        action={<DashboardCardActionsDropdown />}
        size="lg"
        contentClassName="gap-y-0 px-6 pb-6"
      >
        <LiveNotificationSettings />
      </DashboardCard>

      {/* Notifications */}
      <DashboardCard title="All Notifications" action={<DashboardCardActionsDropdown />} size="lg" contentClassName="gap-y-0 px-6 pb-6">
        <NotificationList />
      </DashboardCard>

      {/* Rule Manager */}
      {canManage && (
        <DashboardCard title="Notification Triggers" period="Configure which events send notifications and to whom" action={<DashboardCardActionsDropdown />} size="lg" contentClassName="gap-y-0 px-6 pb-6">
          <NotificationRuleManager availableRoles={roles ?? []} />
        </DashboardCard>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.NOTIFICATIONS_READ]}>
      <NotificationsPageContent />
    </RequirePagePermission>
  );
}
