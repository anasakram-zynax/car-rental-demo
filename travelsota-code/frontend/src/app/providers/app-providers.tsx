'use client';

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/lib/auth/context';
import { ThemeProvider } from '@/context/ThemeContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { HtmlDirectionSetter } from '@/components/common/HtmlDirectionSetter';
import { ToastHost } from '@/lib/toast';
import RealtimeNotificationToaster from '@/features/notifications/components/RealtimeNotificationToaster';

interface AppProvidersProps {
  children: ReactNode;
  /** Currency code from the visitor's tq_currency cookie, read server-side
   *  in layout.tsx — prevents the hydration-time flash to the hardcoded
   *  USD default for returning visitors. */
  initialCurrencyCode?: string;
}

export function AppProviders({ children, initialCurrencyCode }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <SidebarProvider>
            <CurrencyProvider initialCurrencyCode={initialCurrencyCode}>
              <LanguageProvider>
                <HtmlDirectionSetter />
                <ToastHost />
                {children}
                <RealtimeNotificationToaster />
              </LanguageProvider>
            </CurrencyProvider>
          </SidebarProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
