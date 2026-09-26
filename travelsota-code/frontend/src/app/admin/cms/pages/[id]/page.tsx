'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { PageEditor } from '@/features/cms/components/page-editor';

function EditPage() {
  const params = useParams<{ id: string }>();
  return <PageEditor pageId={params.id} />;
}

export default function AdminCmsEditPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.CMS_READ, PermissionCode.CMS_WRITE]}>
        <EditPage />
      </RequirePagePermission>
    </Suspense>
  );
}
