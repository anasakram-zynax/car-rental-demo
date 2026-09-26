"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { AdminPageHeader } from "@/components/admin/shared/AdminPageHeader";
import BookingsTable from "@/components/admin/bookings/BookingsTable";

function PlaneSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8l-8.2-1.8a2 2 0 0 0-.6 3.8l6.2 2.5 2.5 6.2a2 2 0 0 0 3.8-.6Z" />
    </svg>
  );
}

function BuildingSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="10" y2="6" />
      <line x1="8" y1="10" x2="10" y2="10" />
      <line x1="8" y1="14" x2="10" y2="14" />
      <line x1="14" y1="6" x2="16" y2="6" />
      <line x1="14" y1="10" x2="16" y2="10" />
      <line x1="14" y1="14" x2="16" y2="14" />
    </svg>
  );
}

function ListSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

const TAB_META = {
  all: { label: "All Bookings", icon: ListSvg, desc: "View all booking records across modules" },
  flights: { label: "Flights", icon: PlaneSvg, desc: "Flight booking records from Travelport" },
  hotels: { label: "Hotels", icon: BuildingSvg, desc: "Hotel booking records from Hotelbeds" },
} as const;

function BookingsPageInner() {
  const activeTab = (useSearchParams().get("tab") ?? "all") as keyof typeof TAB_META;
  const meta = TAB_META[activeTab] ?? TAB_META.all;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={meta.label}
        description={meta.desc}
        breadcrumbs={[{ label: 'Bookings' }, { label: meta.label }]}
      />

      <div className="rounded-2xl border border-gray-200/70 bg-white dark:border-gray-700/50 dark:bg-gray-900">
        {/* Do not remount per sub-tab: table resets page/selection via [type] effect
            while keepPreviousData provides an instant, smooth data transition. */}
        <BookingsTable type={activeTab === "all" ? "all" : activeTab} />
      </div>
    </div>
  );
}

export default function AdminBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="h-5 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-1.5">
              <div className="h-4 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          <div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
        </div>
      }
    >
      <RequirePagePermission permissions={[PermissionCode.BOOKINGS_READ]}>
        <BookingsPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
