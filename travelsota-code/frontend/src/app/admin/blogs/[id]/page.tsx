'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { PostEditor } from '@/features/blog/components/post-editor';

function EditPostPage() {
  const params = useParams<{ id: string }>();
  return <PostEditor postId={params.id} />;
}

export default function AdminEditBlogPostPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <RequirePagePermission permissions={[PermissionCode.BLOGS_READ, PermissionCode.BLOGS_WRITE]}>
        <EditPostPage />
      </RequirePagePermission>
    </Suspense>
  );
}
