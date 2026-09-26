'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface RequireAuthProps {
  children: ReactNode;
  message?: string;
}

export function RequireAuth({ children, message }: RequireAuthProps) {
  const t = useTranslations('Auth');
  const { isAuthenticated } = useAuth();
  const loginUrl = typeof window !== 'undefined'
    ? `/signin?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
    : '/signin';

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Card className="max-w-sm text-center">
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{t('signInRequiredTitle')}</h2>
          <p className="text-sm text-zinc-500">
            {message ?? t('requireAuthDefault')}
          </p>
          <div className="flex justify-center gap-3">
            <Link href={loginUrl}>
              <Button>{t('signInButton')}</Button>
            </Link>
            <Link href="/signup">
              <Button variant="secondary">{t('createAccountButton')}</Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
