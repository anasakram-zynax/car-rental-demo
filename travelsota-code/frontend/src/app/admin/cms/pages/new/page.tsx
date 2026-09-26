'use client';

import { Suspense } from 'react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { PageEditor } from '@/features/cms/components/page-editor';

function NewPage() {
  return <PageEditor />;
}

export default function AdminCmsNewPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.CMS_READ, PermissionCode.CMS_WRITE]}>
        <NewPage />
      </RequirePagePermission>
    </Suspense>
  );
}
