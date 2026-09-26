"use client";


import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { FullscreenToggle } from "@/components/layout/FullscreenToggle";
import NotificationBell from "@/features/notifications/components/NotificationBell";
import UserDropdown from "@/components/header/UserDropdown";
import { CurrencySelector } from "@/components/common/CurrencySelector";

// ─── AppHeader (Reference-2 vertical-layout-header pattern) ──────────
// Matches dashboard-refference-2/full-kit/src/components/layout/
// vertical-layout/vertical-layout-header.tsx exactly.

export default function AppHeader() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-50 w-full bg-background border-b border-sidebar-border">
      <div className="container flex h-16 justify-between items-center gap-4">
        {/* Mobile sidebar toggle button */}
        {isMobile && (
          <button
            data-sidebar="trigger"
            onClick={() => setOpenMobile(!openMobile)}
            aria-label="Toggle Sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M6 2H2.5C2.22386 2 2 2.22386 2 2.5V13.5C2 13.7761 2.22386 14 2.5 14H6V2Z"
                fill="currentColor"
              />
              <path
                d="M7 2H13.5C13.7761 2 14 2.22386 14 2.5V13.5C14 13.7761 13.7761 14 13.5 14H7V2Z"
                fill="currentColor"
                fillOpacity="0.35"
              />
            </svg>
          </button>
        )}

        {/* Desktop sidebar trigger */}
        <SidebarTrigger className="hidden lg:flex lg:me-auto" />

        {/* Right-side controls */}
        <div className="flex grow justify-end gap-2">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Open website"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Website
          </Link>
          <NotificationBell />
          <FullscreenToggle />
          {/* Same selector as the main site header — shared CurrencyContext
              + tq_currency cookie, so admin and storefront stay in sync. */}
          <CurrencySelector />
          <UserDropdown adminSurface />
        </div>
      </div>
    </header>
  );
}
