'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading, isAdmin, isAgent } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      router.replace('/signin?redirect=/dashboard');
    } else if (isAdmin) {
      router.replace('/admin');
    } else if (isAgent) {
      router.replace('/agent/bookings');
    }
  }, [isAuthenticated, isAuthLoading, isAdmin, isAgent, router]);

  if (isAuthLoading || !isAuthenticated || isAdmin || isAgent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-teal" />
      </div>
    );
  }

  return <DashboardShell>{children}</DashboardShell>;
}
