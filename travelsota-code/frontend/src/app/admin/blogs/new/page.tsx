'use client';

import { Suspense } from 'react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { PostEditor } from '@/features/blog/components/post-editor';

function NewPostPage() {
  return <PostEditor />;
}

export default function AdminNewBlogPostPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.BLOGS_READ, PermissionCode.BLOGS_WRITE]}>
        <NewPostPage />
      </RequirePagePermission>
    </Suspense>
  );
}
