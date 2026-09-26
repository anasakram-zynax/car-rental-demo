"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";

import "../themes.css";
import "./admin-tables.css";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSettingsProvider, useAdminSettings } from "@/context/AdminSettingsContext";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/layout/AppHeader";
import { AppHeaderHorizontal } from "@/components/layout/AppHeaderHorizontal";
import AppSidebar from "@/components/layout/AppSidebar";

// ─── AdminWorkspace (Reference-2 vertical/horizontal layout pattern) ──

function AdminWorkspace({ children }: { children: ReactNode }) {
  const { settings, shellClass } = useAdminSettings();
  const isHorizontal = settings.layout === "horizontal";

  if (isHorizontal) {
    return (
      <div className={`admin-shell ${shellClass} min-h-screen bg-background text-foreground`}>
        <AppHeaderHorizontal />
        <main className="mx-auto w-full max-w-(--breakpoint-2xl) p-4 md:p-6">
          {children}
        </main>
      </div>
    );
  }

  // Vertical layout: sidebar + header + main (Reference-2 pattern)
  return (
    <div className={`admin-shell ${shellClass} min-h-screen flex w-full bg-background text-foreground`}>
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="w-full flex-1 bg-muted/40 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── AdminLayout ────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin, isAuthLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      router.replace("/signin?redirect=/admin");
    } else if (!isAdmin) {
      router.replace("/");
    }
  }, [isAuthenticated, isAdmin, isAuthLoading, router]);

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return (
    <AdminSettingsProvider>
      <SidebarProvider defaultOpen={true}>
        <AdminWorkspace>{children}</AdminWorkspace>
      </SidebarProvider>
    </AdminSettingsProvider>
  );
}
