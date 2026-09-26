'use client';

import { Suspense } from 'react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import GeneralSettingsTab from '@/components/admin/settings/GeneralSettingsTab';

function GeneralSettingsPageInner() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">General Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Platform-wide behavior and booking policies.
        </p>
      </div>
      <GeneralSettingsTab />
    </div>
  );
}

export default function GeneralSettingsPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.SETTINGS_READ]}>
      <Suspense fallback={<div className="space-y-4"><div className="h-4 w-48 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div>}>
        <GeneralSettingsPageInner />
      </Suspense>
    </RequirePagePermission>
  );
}
