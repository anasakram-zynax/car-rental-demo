'use client';

import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { MainFooter } from '@/components/layout/MainFooter';
import { FloatingWhatsApp } from '@/components/common/FloatingWhatsApp';
import { ScrollToTop } from '@/components/common/ScrollToTop';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <MainFooter />
      <ScrollToTop />
      <FloatingWhatsApp />
    </>
  );
}
