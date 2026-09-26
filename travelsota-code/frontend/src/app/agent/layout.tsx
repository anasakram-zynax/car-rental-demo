'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import AgentSidebar from '@/components/agent/AgentSidebar';
import AgentHeader from '@/components/agent/AgentHeader';
import type { ReactNode } from 'react';

export default function AgentLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAgent, isAgentApproved, agentKycStatus, isAuthLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) { router.replace('/signin?redirect=/agent'); }
    else if (!isAgent) { router.replace('/'); }
  }, [isAuthenticated, isAgent, isAuthLoading, router]);

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-teal-600" />
      </div>
    );
  }

  if (!isAuthenticated || !isAgent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-teal-600" />
      </div>
    );
  }

  const isUnverifiedSubPage = !isAgentApproved && pathname !== '/agent';
  const showKycBanner = isAgentApproved && agentKycStatus && agentKycStatus !== 'APPROVED';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AgentSidebar />
      <div className="pl-64">
        <AgentHeader isApproved={isAgentApproved} kycStatus={agentKycStatus} />
        <main className="p-6">
          {showKycBanner && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-800/50 dark:bg-warning-950/20">
              <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning-500" />
              <p className="text-sm font-medium text-warning-800 dark:text-warning-300">
                {agentKycStatus === 'PENDING'
                  ? 'KYC verification is pending. Some features may be limited until verified.'
                  : 'KYC was rejected. Please contact support to resolve this.'}
              </p>
            </div>
          )}
          {isUnverifiedSubPage ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <div className="max-w-md rounded-2xl border border-warning-200 bg-warning-50 p-8 text-center dark:border-warning-800/50 dark:bg-warning-950/20">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-900/30">
                  <svg className="h-7 w-7 text-warning-600 dark:text-warning-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-warning-800 dark:text-warning-300">Account Pending Approval</h2>
                <p className="text-sm text-amber-600 dark:text-amber-400">Your account is awaiting admin approval. You will be able to book once approved.</p>
              </div>
            </div>
          ) : (children)}
        </main>
      </div>
    </div>
  );
}
