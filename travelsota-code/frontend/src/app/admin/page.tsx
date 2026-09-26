"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useApiQuery } from "@/hooks/useApiQuery";
import type { TrendPeriod } from "@/components/common/ChartTab";
import { RequirePagePermission } from "@/components/admin/permission/RequirePagePermission";
import { PermissionCode } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  BookingsTableSkeleton,
  BookingsTrendSkeleton,
  CustomerInsightsSkeleton,
  PaymentStatusSkeleton,
  RevenueBySourceSkeleton,
  SalesTrendSkeleton,
  TopDestinationsSkeleton,
} from "@/components/admin/dashboard/ecommerce/widget-skeleton";

// KPI overview stays static (above the fold, small).
import { EcommerceOverview, type OverviewStats } from "@/components/admin/dashboard/ecommerce/overview";

// Below-fold widgets are code-split so Recharts + TanStack never parse until
// the section actually mounts — keeps the initial main-thread work minimal.
// Every widget mounts IMMEDIATELY (no staggered deferral): each one renders
// its own in-card loading state until its data lands, so the full layout is
// present from the first paint — no late reflow, no pop-in.
import type { BookingsTrendMonth } from "@/components/admin/dashboard/ecommerce/bookings-trend";
import type { RevenueSource } from "@/components/admin/dashboard/ecommerce/revenue-by-source";
import type { CustomerInsightsData } from "@/components/admin/dashboard/ecommerce/customer-insights";
import type { RevenuePoint } from "@/components/admin/dashboard/ecommerce/sales-trend";
import type { TopDestination } from "@/components/admin/dashboard/ecommerce/top-destinations";

// Matched-height loading placeholders: each widget's dynamic() loader mirrors
// its final footprint so the page never jumps when data lands.
const BookingsTrend = dynamic(() => import("@/components/admin/dashboard/ecommerce/bookings-trend").then((m) => m.BookingsTrend), { ssr: false, loading: () => <BookingsTrendSkeleton /> });
const RevenueBySource = dynamic(() => import("@/components/admin/dashboard/ecommerce/revenue-by-source").then((m) => m.RevenueBySource), { ssr: false, loading: () => <RevenueBySourceSkeleton /> });
const CustomerInsights = dynamic(() => import("@/components/admin/dashboard/ecommerce/customer-insights").then((m) => m.CustomerInsights), { ssr: false, loading: () => <CustomerInsightsSkeleton /> });
const PaymentStatusDistribution = dynamic(() => import("@/components/admin/dashboard/ecommerce/payment-status-distribution").then((m) => m.PaymentStatusDistribution), { ssr: false, loading: () => <PaymentStatusSkeleton /> });
const SalesTrend = dynamic(() => import("@/components/admin/dashboard/ecommerce/sales-trend").then((m) => m.SalesTrend), { ssr: false, loading: () => <SalesTrendSkeleton /> });
const TopDestinations = dynamic(() => import("@/components/admin/dashboard/ecommerce/top-destinations").then((m) => m.TopDestinations), { ssr: false, loading: () => <TopDestinationsSkeleton /> });
const BookingsTable = dynamic(() => import("@/components/admin/dashboard/ecommerce/bookings-table").then((m) => m.BookingsTable), { ssr: false, loading: () => <BookingsTableSkeleton /> });

// ─── Aggregate overview contract (GET /admin/dashboard/overview) ────────────
// One request now feeds stats, revenue-by-source, customer insights and top
// destinations. Per-section failure isolation on the backend degrades a
// broken section to null — the widgets keep rendering their own provisional
// states instead of erroring the page.
interface DashboardOverviewResponse {
  stats: OverviewStats | null;
  revenueTrend: { range: string; currency?: string; data: RevenuePoint[] } | null;
  bookingsTrend: { period: string; months: BookingsTrendMonth[] } | null;
  revenueBySource: { period: string; currency?: string; summary: { totalRevenue: number; percentageChange: number }; sources: RevenueSource[] } | null;
  customerInsights: CustomerInsightsData | null;
  topDestinations: { period: string; currency?: string; products: TopDestination[] } | null;
  generatedAt: string;
}

// Each chart owns its period and its own endpoint call — switching one chart
// never recomputes the other sections (the aggregate stays cached and
// untouched). Mount fires three small parallel requests instead of one
// blocking aggregate for everything.
const DASHBOARD_QUERY_KEYS = [
  ["dashboard", "overview"],
  ["dashboard", "trend"],
  ["dashboard", "revenue"],
  ["admin", "bookings"],
] as const;

/**
 * True while any dashboard query is in flight — drives the header refresh
 * spinner. useSyncExternalStore keeps the subscription outside React state so
 * cache events never re-render the page itself.
 */
function isAnyDashboardQueryFetching(queryClient: ReturnType<typeof useQueryClient>) {
  return DASHBOARD_QUERY_KEYS.some((key) =>
    queryClient.getQueryState(key)?.fetchStatus === "fetching"
  );
}

function RefreshControl({ queryKeys }: { queryKeys: readonly (readonly string[])[] }) {
  const queryClient = useQueryClient();
  const isFetching = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const cache = queryClient.getQueryCache();
        let last = isAnyDashboardQueryFetching(queryClient);
        return cache.subscribe(() => {
          const next = isAnyDashboardQueryFetching(queryClient);
          if (next !== last) {
            last = next;
            onChange();
          }
        });
      },
      [queryClient]
    ),
    () => isAnyDashboardQueryFetching(queryClient),
    () => false
  );

  const refresh = () => {
    for (const key of queryKeys) {
      queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={refresh}
      disabled={isFetching}
      aria-label={isFetching ? "Refreshing dashboard" : "Refresh dashboard data"}
      title="Refresh dashboard data"
      className="size-8 shrink-0 text-muted-foreground"
    >
      <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
    </Button>
  );
}

/**
 * Staged widget mounting — the click-during-load fix.
 * Staged widget mounting — cooperative main-thread yielding.
 *
 * All six below-fold widgets previously committed in ONE render pass. Each
 * Recharts mount measures + lays out its SVG synchronously and the TanStack
 * table builds its whole row model — together that produced 400–1200ms
 * main-thread tasks (measured under 4× CPU throttle), which on a real phone
 * freezes every tap long enough for Chrome's "page unresponsive" dialog.
 * Staging the commits across separate frames caps each task's size and keeps
 * gaps between them, so taps always land. Skeletons (matched-height) occupy
 * the space until each batch mounts — zero layout shift.
 */
function useStagedMount(): number {
  const [stage, setStage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let current = 1;

    const scheduleNext = () => {
      if (cancelled || current >= 4) return;

      const advance = () => {
        if (cancelled) return;
        current += 1;
        setStage(current);
        if (current < 4) {
          scheduleNext();
        }
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(
          () => {
            setTimeout(advance, 80);
          },
          { timeout: 350 }
        );
      } else {
        setTimeout(advance, 120);
      }
    };

    const initialTimer = setTimeout(scheduleNext, 100);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
    };
  }, []);

  return stage;
}

// Freshness-first with freeze protection: dashboard figures reflect updates
// without overwhelming the main thread with refetch storms on window blur/focus.
const DASHBOARD_OPTIONS = {
  requestOptions: { auth: true } as const,
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  refetchOnReconnect: true,
  retry: 1,
} as const;

// Sales-trend endpoint uses 30d for the monthly view (day buckets).
const revenueRangeFor = (period: TrendPeriod) => (period === "monthly" ? "30d" : period);

function AdminHomePageContent() {
  const { isAuthenticated, isAdmin, user } = useAuth();
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("monthly");
  const [salesPeriod, setSalesPeriod] = useState<TrendPeriod>("monthly");
  // Staged mount batches — see useStagedMount above.
  const mountStage = useStagedMount();

  // Aggregate: stats + revenueTrend (30d) + bookingsTrend (monthly) + revenue-by-source + insights + destinations.
  const { data: overview, isLoading: overviewLoading, dataUpdatedAt } = useApiQuery<DashboardOverviewResponse>(
    ["dashboard", "overview"], "/admin/dashboard/overview", DASHBOARD_OPTIONS,
  );

  // Bookings trend — period-dependent (Monthly / Quarterly / Annually).
  // Monthly is pre-loaded by the overview aggregate; non-monthly periods trigger a dedicated fetch.
  const isCustomTrendPeriod = trendPeriod !== "monthly";
  const { data: trendData, isLoading: trendLoading } = useApiQuery<{ period: string; months: BookingsTrendMonth[] }>(
    ["dashboard", "trend", trendPeriod], `/admin/dashboard/bookings-trend?period=${trendPeriod}`,
    {
      ...DASHBOARD_OPTIONS,
      enabled: isCustomTrendPeriod,
      placeholderData: keepPreviousData,
    },
  );

  // Sales trend (revenue) — period-dependent as well; dedicated endpoint for non-monthly.
  const isCustomSalesPeriod = salesPeriod !== "monthly";
  const { data: revenueData, isLoading: revenueLoading } = useApiQuery<{ range: string; currency?: string; data: RevenuePoint[] }>(
    ["dashboard", "revenue", salesPeriod], `/admin/dashboard/revenue?range=${revenueRangeFor(salesPeriod)}`,
    {
      ...DASHBOARD_OPTIONS,
      enabled: isCustomSalesPeriod,
      placeholderData: keepPreviousData,
    },
  );

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-base font-semibold">Sign in Required</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">You need to sign in with an admin account to access this area.</p>
        <div className="mt-4 flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">Use your admin credentials to manage the dashboard.</p>
          <Link href="/signin?redirect=/admin"><Button variant="primary" size="lg">Sign in</Button></Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-base font-semibold">Access Denied</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Your account does not have admin privileges.</p>
        <div className="mt-4 flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">Please contact your administrator to request access.</p>
          <Link href="/"><Button variant="secondary">Back to Home</Button></Link>
        </div>
      </div>
    );
  }

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Admin";
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="min-w-0 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3 md:col-span-full md:backdrop-blur-md">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            Welcome back, {displayName}
            {lastSynced && <span className="ms-2 text-xs">· synced {lastSynced}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshControl queryKeys={DASHBOARD_QUERY_KEYS} />
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" href="/">
                  Home
                  <svg className="stroke-current" width="17" height="16" viewBox="0 0 17 16" fill="none">
                    <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
              <li className="text-sm font-medium text-foreground">Dashboard</li>
            </ol>
          </nav>
        </div>
      </div>

      {/* All widgets mount immediately; each renders its own in-card loading
          state until its data lands. No full-widget skeleton swaps, no late
          layout shifts. The `?? undefined` mapping converts the aggregate's
          per-section `null` (backend partial failure) into "not known yet" —
          exactly what widgets' provisional/fallback rendering expects. */}
      {/* Stage 1 — KPI overview commits alone: the first paint is tiny, so
          taps respond instantly even on a cold mid-range phone. */}
      <EcommerceOverview stats={overview?.stats ?? undefined} isLoading={overviewLoading} />

      {/* Stage 2 — first chart batch. */}
      {mountStage >= 2 ? (
        <>
          <BookingsTrend
            months={trendData?.months ?? overview?.bookingsTrend?.months ?? undefined}
            period={trendPeriod}
            onPeriodChange={setTrendPeriod}
            isLoading={isCustomTrendPeriod ? trendLoading : overviewLoading}
          />
          <RevenueBySource
            period={overview?.revenueBySource?.period ?? undefined}
            sources={overview?.revenueBySource?.sources ?? undefined}
            totalRevenue={overview?.revenueBySource?.summary?.totalRevenue ?? undefined}
            percentageChange={overview?.revenueBySource?.summary?.percentageChange ?? undefined}
            currency={overview?.revenueBySource?.currency ?? undefined}
            isLoading={overviewLoading}
          />
        </>
      ) : (
        <>
          <BookingsTrendSkeleton />
          <RevenueBySourceSkeleton />
        </>
      )}

      {/* Stage 3 — remaining charts. */}
      {mountStage >= 3 ? (
        <>
          <div className="col-span-full grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-4">
            <CustomerInsights data={overview?.customerInsights ?? undefined} isLoading={overviewLoading} />
            <PaymentStatusDistribution paymentBreakdown={overview?.stats?.paymentBreakdown ?? undefined} isLoading={overviewLoading} />
          </div>
          <SalesTrend
            data={isCustomSalesPeriod ? revenueData?.data : (overview?.revenueTrend?.data ?? revenueData?.data)}
            currency={isCustomSalesPeriod ? revenueData?.currency : (overview?.revenueTrend?.currency ?? revenueData?.currency)}
            isLoading={isCustomSalesPeriod ? revenueLoading : overviewLoading}
            period={salesPeriod}
            onPeriodChange={setSalesPeriod}
          />
          <TopDestinations
            period={overview?.topDestinations?.period ?? undefined}
            products={overview?.topDestinations?.products ?? undefined}
            currency={overview?.topDestinations?.currency ?? undefined}
            isLoading={overviewLoading}
          />
        </>
      ) : (
        <>
          <div className="col-span-full grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-4">
            <CustomerInsightsSkeleton />
            <PaymentStatusSkeleton />
          </div>
          <SalesTrendSkeleton />
          <TopDestinationsSkeleton />
        </>
      )}

      {/* Stage 4 — Recent Bookings last: TanStack table is the heaviest
          mount and sits below the fold; 10 rows limit on overview minimizes
          memory, TanStack models, and layout costs. */}
      <div className="min-w-0 md:col-span-full">
        {mountStage >= 4 ? <BookingsTable limit={10} /> : <BookingsTableSkeleton />}
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.REPORTS_READ]}>
      <AdminHomePageContent />
    </RequirePagePermission>
  );
}
