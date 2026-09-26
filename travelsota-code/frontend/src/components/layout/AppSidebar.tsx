"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar as SidebarWrapper,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

import { usePermissions } from "@/components/admin/permission/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/common/Logo";
import { navSections, type NavItem, type NavSubItem } from "@/config/admin-nav";
import { ComingSoonModal } from "@/features/coming-soon/ComingSoonModal";
import { isRealSuperAdmin } from "@/lib/real-admin";
import { DEMO_UI_ENABLED } from "@/lib/flags";
import { prefetchOnHover, cancelPrefetchHover, prefetchRouteData } from "@/lib/admin-prefetch";

const COMING_SOON_KEY: Record<string, string> = {
  "Tours": "tours",
  "Cars": "cars",
  "Visa": "visa",
  "eSIM": "esim",
  "Umrah": "umrah",
};

const AppSidebar: React.FC = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const { setOpenMobile, isMobile, state } = useSidebar();
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

  const isActive = (path: string): boolean => {
    if (!path.includes("?")) {
      if (path !== pathname) return false;
      return !searchParams.has("tab") || searchParams.get("tab") === "all";
    }
    const [base, qs] = path.split("?");
    if (base !== pathname) return false;
    const params = new URLSearchParams(qs);
    for (const [key, val] of params) {
      if (searchParams.get(key) !== val) return false;
    }
    return true;
  };

  const isParentActive = (item: NavItem): boolean => {
    if (!item.subItems) return item.path ? isActive(item.path) : false;
    return item.subItems.some((sub) => sub.path && isActive(sub.path));
  };

  const renderMenuItem = (item: NavItem) => {
    // Coming-soon item: render as badge button (no subItems)
    if (item.comingSoon) {
      return (
        <SidebarMenuItem key={item.name}>
          <SidebarMenuButton
            isActive={false}
            tooltip={item.name}
            onClick={() => setComingSoonModule(COMING_SOON_KEY[item.name] ?? "tours")}
          >
            {item.icon}
            <span>{item.name}</span>
            <Badge variant="secondary" className="ml-auto bg-amber-50 text-amber-600 text-[9px] font-bold uppercase tracking-wider border-amber-200">
              Soon
            </Badge>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    // Collapsible dropdown
    if (item.subItems) {
      // Expanded: highlight only the exact active child (no parent+child
      // double-highlight). Collapsed: sub-items are hidden, so the parent icon
      // is highlighted to mark the active section.
      const active = isParentActive(item);

      return (
        <Collapsible key={item.name} defaultOpen={active} className="group/collapsible">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                isActive={state === "collapsed" ? active : false}
                className="w-full justify-between [&[data-state=open]>svg.lucide-chevron-down]:rotate-180"
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.name}</span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <SidebarMenuSub>
                {item.subItems
                  .filter(
                    (sub: NavSubItem) =>
                      !sub.permissionCode || hasPermission(sub.permissionCode),
                  )
                  .map((sub: NavSubItem) => (
                    <SidebarMenuItem key={sub.name}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={sub.path && !sub.comingSoon ? isActive(sub.path) : false}
                      >
                        {sub.comingSoon ? (
                          <button
                            type="button"
                            onClick={() => setComingSoonModule(COMING_SOON_KEY[sub.name] ?? "tours")}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                          >
                            {sub.icon && (
                              <span className="flex h-5 w-5 items-center justify-center shrink-0">
                                {sub.icon}
                              </span>
                            )}
                            <span>{sub.name}</span>
                            <Badge variant="secondary" className="ml-auto bg-amber-50 text-amber-600 text-[9px] font-bold uppercase tracking-wider border-amber-200">
                              Soon
                            </Badge>
                          </button>
                        ) : (
                          <Link
                            href={sub.path ?? "#"}
                            onMouseEnter={() => prefetchOnHover(sub.path)}
                            onMouseLeave={() => cancelPrefetchHover(sub.path)}
                            onFocus={() => prefetchRouteData(sub.path)}
                            onClick={(e) => {
                              // Same-tab repeat clicks: no-op instead of a
                              // redundant navigation + refetch storm (freeze class).
                              if (sub.path && isActive(sub.path)) {
                                e.preventDefault();
                                return;
                              }
                              prefetchRouteData(sub.path);
                              if (isMobile) setOpenMobile(false);
                            }}
                          >
                            {sub.icon && (
                              <span className="flex h-5 w-5 items-center justify-center shrink-0">
                                {sub.icon}
                              </span>
                            )}
                            <span>{sub.name}</span>
                          </Link>
                        )}
                      </SidebarMenuSubButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    // Plain link item
    if (item.path) {
      const itemPath = item.path;
      const active = isActive(itemPath);

      return (
        <SidebarMenuItem key={item.name}>
          <SidebarMenuButton
            isActive={active}
            asChild
            tooltip={item.name}
            onClick={() => isMobile && setOpenMobile(false)}
          >
            <Link
              href={itemPath}
              onMouseEnter={() => prefetchOnHover(itemPath)}
              onMouseLeave={() => cancelPrefetchHover(itemPath)}
              onFocus={() => prefetchRouteData(itemPath)}
              onClick={(e) => {
                if (isActive(itemPath)) {
                  e.preventDefault();
                  return;
                }
                prefetchRouteData(itemPath);
              }}
            >
              {item.icon}
              <span>{item.name}</span>
              {item.badge && (
                <span className="ml-auto rounded-full bg-brand-teal/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-teal">
                  {item.badge}
                </span>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return null;
  };

  return (
    <SidebarWrapper collapsible="icon" className="admin-sidebar-surface">
      <SidebarHeader>
        <Link
          href="/admin"
          className="flex items-center gap-2 px-2 pt-2 pb-0 text-foreground"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <Logo size="sm" compact={state === 'collapsed'} withLink={false} />
        </Link>
      </SidebarHeader>

      {/* The ONLY scroll container (SidebarContent + the sheet itself are
          overflow-hidden). overflow-y-auto + touch-action pan-y lets wheel,
          trackpad, touch and keyboard scroll reach the bottom nav items on
          short/mobile viewports; overscroll-contain stops scroll chaining to
          the page behind the sheet. */}
      <nav
        data-slot="sidebar-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] [scrollbar-width:thin] [scrollbar-gutter:stable]"
        aria-label="Admin navigation"
      >
        <SidebarContent className="gap-0">
          {filteredSections.map((section) => (
            <SidebarGroup key={section.title}>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => renderMenuItem(item))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </nav>
      <ComingSoonModal moduleKey={comingSoonModule} onClose={() => setComingSoonModule(null)} />
    </SidebarWrapper>
  );
};

export default AppSidebar;
