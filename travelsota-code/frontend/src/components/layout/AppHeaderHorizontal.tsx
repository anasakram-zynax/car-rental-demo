"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { FullscreenToggle } from "@/components/layout/FullscreenToggle";
import NotificationBell from "@/features/notifications/components/NotificationBell";
import { Logo } from "@/components/common/Logo";
import { CurrencySelector } from "@/components/common/CurrencySelector";
import UserDropdown from "@/components/header/UserDropdown";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { usePermissions } from "@/components/admin/permission/usePermissions";
import { useAdminSettings } from "@/context/AdminSettingsContext";
import { navSections, type NavItem } from "@/config/admin-nav";
import { ComingSoonModal } from "@/features/coming-soon/ComingSoonModal";
import { useAuth } from "@/hooks/useAuth";
import { isRealSuperAdmin } from "@/lib/real-admin";
import { DEMO_UI_ENABLED } from "@/lib/flags";

// ─── Top-bar menubar (Reference-2 horizontal header) ────────────────────

function TopBarHeaderMenubar() {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const { shellClass } = useAdminSettings();
  const [comingSoonModule, setComingSoonModule] = useState<string | null>(null);

  const filteredSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            // Demo surfaces vanish entirely when DEMO_UI is disabled.
            if (!DEMO_UI_ENABLED && item.realAdminOnly) return false;
            // Real-admin surfaces: visible ONLY to the configured super admin email
            if (item.realAdminOnly && !isRealSuperAdmin(user?.email)) return false;
            if (!item.permissionCode) return true;
            return hasPermission(item.permissionCode);
          }),
        }))
        .filter((s) => s.items.length > 0),
    [hasPermission, user?.email],
  );

  const isActive = (path: string) => {
    const base = path.split("?")[0];
    return base === pathname;
  };

  const renderItem = (item: NavItem) => {
    if (item.comingSoon) {
      const keyByLabel: Record<string, string> = {
        Tours: "tours",
        Cars: "cars",
        Visa: "visa",
        eSIM: "esim",
        Umrah: "umrah",
      };
      return (
        <DropdownMenuItem
          key={item.name}
          onSelect={(e) => {
            e.preventDefault();
            setComingSoonModule(keyByLabel[item.name] ?? "tours");
          }}
          className="gap-2"
        >
          {item.icon}
          <span>{item.name}</span>
          <Badge variant="secondary" className="ml-auto bg-amber-50 text-amber-600 text-[9px] font-bold uppercase tracking-wider border-amber-200">
            Soon
          </Badge>
        </DropdownMenuItem>
      );
    }
    if (item.subItems) {
      return (
        <React.Fragment key={item.name}>
          <DropdownMenuLabel className="flex items-center gap-2">
            {item.icon}
            {item.name}
            {item.label && <Badge variant="secondary">{item.label}</Badge>}
          </DropdownMenuLabel>
          {item.subItems
            .filter((sub) => !sub.permissionCode || hasPermission(sub.permissionCode))
            .map((sub) => {
              if (sub.comingSoon) {
                const keyByLabel: Record<string, string> = {
                  'Tour Packages': 'tours',
                  'Car Rentals': 'cars',
                  'Visa Services': 'visa',
                  'eSIM & Connectivity': 'esim',
                  'Umrah Packages': 'umrah',
                };
                return (
                  <DropdownMenuItem
                    key={sub.name}
                    className="gap-2 ps-8"
                    onSelect={(e) => {
                      e.preventDefault();
                      setComingSoonModule(keyByLabel[sub.name] ?? 'tours');
                    }}
                  >
                    {sub.icon}
                    <span>{sub.name}</span>
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                      Soon
                    </span>
                  </DropdownMenuItem>
                );
              }
              return sub.path ? (
                <DropdownMenuItem
                  key={sub.name}
                  asChild
                  className={isActive(sub.path) ? "bg-accent font-medium" : ""}
                >
                  <Link href={sub.path} className="gap-2 ps-8">
                    {sub.icon}
                    {sub.name}
                    {sub.label && <Badge variant="secondary">{sub.label}</Badge>}
                  </Link>
                </DropdownMenuItem>
              ) : null;
            })}
        </React.Fragment>
      );
    }

    if (item.path) {
      return (
        <DropdownMenuItem
          key={item.name}
          asChild
          className={isActive(item.path) ? "bg-accent font-medium" : ""}
        >
          <Link href={item.path} className="gap-2">
            {item.icon}
            {item.name}
            {item.badge && (
              <span className="ml-auto rounded-full bg-brand-teal/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-teal">
                {item.badge}
              </span>
            )}
            {item.label && <Badge variant="secondary">{item.label}</Badge>}
          </Link>
        </DropdownMenuItem>
      );
    }

    return null;
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {filteredSections.map((section) => (
          <DropdownMenu key={section.title}>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground">
                {section.title}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={`admin-dropdown-content min-w-56 ${shellClass}`}>
              {section.items.map(renderItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </div>
      <ComingSoonModal moduleKey={comingSoonModule} onClose={() => setComingSoonModule(null)} />
    </>
  );
}

// ─── Bottom bar (Reference-2 bottom-bar-header) ──────────────────────────

function BottomBarHeader() {
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <div className="container flex h-14 justify-between items-center gap-4">
      {/* Mobile sidebar toggle */}
      <button
        data-sidebar="trigger"
        onClick={() => setOpenMobile(!openMobile)}
        aria-label="Toggle Sidebar"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
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
            d="M5.33333 2H2.66667C2.29848 2 2 2.29848 2 2.66667V13.3333C2 13.7015 2.29848 14 2.66667 14H5.33333C5.70152 14 6 13.7015 6 13.3333V2.66667C6 2.29848 5.70152 2 5.33333 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 3H13.3333C13.7015 3 14 3.29848 14 3.66667V12.3333C14 12.7015 13.7015 13 13.3333 13H6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Link
        href="/admin"
        className="hidden lg:flex items-center gap-2"
      >
        <Logo size="md" withLink={false} />
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="hidden sm:flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          Main Website
        </Link>
        <NotificationBell />
        <FullscreenToggle />
        {/* Same selector as the main site header — shared context, stays in sync. */}
        <CurrencySelector />
        <UserDropdown adminSurface />
      </div>
    </div>
  );
}

// ─── Horizontal layout header (Reference-2 horizontal-layout-header) ─────

export function AppHeaderHorizontal() {
  return (
    <header className="sticky top-0 z-50 w-full bg-background border-b border-sidebar-border">
      <div className="container hidden justify-between items-center py-1 lg:flex">
        <TopBarHeaderMenubar />
      </div>
      <div className="hidden h-px w-full bg-sidebar-border lg:block" />
      <BottomBarHeader />
    </header>
  );
}
