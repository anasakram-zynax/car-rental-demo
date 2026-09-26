'use client';

import { Suspense } from 'react';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { MenuBuilder } from '@/features/cms/components/menu-builder';

function CmsMenusInner() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="CMS Menus"
        description="Build and organize the site navigation menus."
        breadcrumbs={[{ label: 'CMS' }, { label: 'Menus' }]}
      />
      <MenuBuilder />
    </div>
  );
}

export default function AdminCmsMenusPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.CMS_READ]}>
        <CmsMenusInner />
      </RequirePagePermission>
    </Suspense>
  );
}
