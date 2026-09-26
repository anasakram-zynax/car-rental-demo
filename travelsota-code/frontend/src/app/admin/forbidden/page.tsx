import { Suspense } from 'react';
import { AccessDeniedPage } from '@/components/admin/permission/AccessDeniedPage';

function ForbiddenContent() {
  return (
    <AccessDeniedPage
      message="You do not have permission to access this page. Please contact your administrator if you believe this is an error."
      backHref="/admin"
      backLabel="Back to Dashboard"
    />
  );
}

export default function AdminForbiddenPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />}>
      <ForbiddenContent />
    </Suspense>
  );
}
