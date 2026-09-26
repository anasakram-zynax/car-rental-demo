"use client";

// ── Demo Intelligence — super-admin analytics for the demo dashboards ────
// Live band → KPIs → charts (logins/time + activity heatmap) → globe +
// countries → dashboards/engagement → top visitors → sessions.
//
// Design notes (impeccable-design / design-taste / ui-ux pass):
//  • Pill palettes use literal rgba() backgrounds so contrast can never
//    break (opacity-modifier classes rendered solid in this Tailwind setup
//    and made tint-on-tint text invisible).
//  • Flags are flagcdn images — Windows doesn't render flag emoji.
//  • Tables are table-fixed with percent widths so headers always sit over
//    their data, with explicit IP columns and self-explanatory headers.
//  • Session rows expand in place for device/full details; the country
//    leaderboard drives the globe (hover = preview, click = lock).

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Clock,
  Globe2,
  LogIn,
  Radio,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/shared/AdminPageHeader";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { isRealSuperAdmin } from "@/lib/real-admin";
import {
  getDemoSummary,
  getDemoSessions,
  getDemoWatchNow,
  type DemoSummary,
  type DemoVisitorRow,
  type DemoSessionRow,
  type DemoWatchItem,
} from "@/features/admin/api/admin-demo-sessions";
// Globe (cobe canvas) loads client-side only — keeps it out of SSR/first paint.
const DemoGlobe = dynamic(
  () => import("@/features/admin/components/DemoGlobe").then((m) => m.default),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" />,
  },
);
import { countryName, flagUrl } from "@/features/admin/components/demo-country";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/modal";
import {
  Eye,
  Globe as GlobeIcon,
  MousePointerClick,
  type LucideIcon,
} from "lucide-react";
import {
  getDemoSessionActivities,
  getDemoVisitorActivities,
  type DemoActivityRow,
} from "@/features/admin/api/admin-demo-sessions";

// ── Formatting helpers ───────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

function fmtCompact(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function shortVisitor(id: string): string {
  return id.slice(-4).toUpperCase();
}

/** Private/loopback addresses aren't real client locations — label them. */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isPrivateIp(v4[1]);
    const l = ip.toLowerCase();
    return (
      l === "::1" ||
      l === "::" ||
      /^f[cd][0-9a-f]{2}:/.test(l) ||
      /^fe[89ab][0-9a-f]:/.test(l)
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0
  );
}

/** Re-render every ${intervalMs} so relative times and countdowns stay fresh.
 *  Pauses entirely while the browser tab is hidden — a background tab must
 *  never wake the main thread for a countdown nobody can see. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible",
  );
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, visible]);
  return now;
}

/** Right-hand chart axis: sub-hour values in minutes, the rest in hours. */
function fmtHoursTick(v: number): string {
  return v < 1 ? `${Math.round(v * 60)}m` : `${+v.toFixed(1)}h`;
}

/** "Chrome · Windows" style readout from a raw user-agent string. */
function deviceFromUa(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Browser";
  return `${browser} · ${os}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  AGENT: "Agent",
  USER: "Customer",
};

// ── Pill palettes ────────────────────────────────────────────────────────
// Backgrounds are literal rgba() inline styles (immune to build/config
// quirks — opacity-modifier classes rendered SOLID here once and made the
// tint-on-tint text invisible). Text colors are 700-level for contrast.

const ROLE_PILL_BG: Record<string, string> = {
  ADMIN: "rgba(59,130,246,0.14)",
  AGENT: "rgba(139,92,246,0.14)",
  USER: "rgba(245,158,11,0.16)",
};
const ROLE_PILL_TEXT: Record<string, string> = {
  ADMIN: "text-blue-700 dark:text-blue-300",
  AGENT: "text-violet-700 dark:text-violet-300",
  USER: "text-amber-700 dark:text-amber-300",
};

function RolePill({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        ROLE_PILL_TEXT[role] ?? "text-muted-foreground",
      )}
      style={{
        backgroundColor: ROLE_PILL_BG[role] ?? "rgba(120,120,120,0.12)",
      }}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-4">
      <div className="flex items-center gap-2.5">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            accent,
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** Short, copyable visitor handle — full UUID lives in the tooltip. */
function VisitorChip({ id, full }: { id: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`${id} — click to copy`}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        full && "break-all",
      )}
    >
      {full ? id : `#${shortVisitor(id)}`}
      {copied && (
        <span className="text-[10px] font-sans text-emerald-600 dark:text-emerald-400">
          copied
        </span>
      )}
    </button>
  );
}

/** IP cell: raw address for public IPs, a clear "Local network" tag otherwise. */
function IpCell({ ip }: { ip: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!ip) return <span className="text-xs text-muted-foreground">—</span>;
  const priv = isPrivateIp(ip);
  return (
    <button
      type="button"
      title={
        priv
          ? `${ip} — private address (server-side proxy or on-site visitor)`
          : `${ip} — click to copy`
      }
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(ip).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-xs transition-colors hover:bg-accent"
    >
      <span className={priv ? "text-muted-foreground" : "text-foreground"}>
        {ip}
      </span>
      {priv ? (
        <span className="rounded bg-muted px-1 text-[10px] font-sans text-muted-foreground">
          local
        </span>
      ) : null}
      {copied && (
        <span className="text-[10px] font-sans text-emerald-600 dark:text-emerald-400">
          copied
        </span>
      )}
    </button>
  );
}

/** Windows-safe flag image (flag emoji don't render on Windows). */
function Flag({ code }: { code: string | null | undefined }) {
  const url = flagUrl(code);
  if (!url) {
    return (
      <span
        aria-hidden
        className="inline-block size-3.5 rounded-[2px] bg-muted"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      className="inline-block h-3.5 w-5 rounded-[2px] object-cover ring-1 ring-black/10 dark:ring-white/15"
    />
  );
}

function LiveDot() {
  return (
    <span className="relative flex size-2.5" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

// ── Live band (hero) ─────────────────────────────────────────────────────

/** Ticking "Updated Xs ago · next in Ys" readout for the 30s polling cycle. */
function UpdatedStat({
  updatedAt,
  intervalSec = 30,
}: {
  updatedAt: number;
  intervalSec?: number;
}) {
  const now = useNow(1000);
  const ageSec = updatedAt
    ? Math.max(0, Math.floor((now - updatedAt) / 1000))
    : null;
  const nextIn = Math.max(0, intervalSec - (ageSec ?? 0));
  return (
    <div>
      <p className="text-xs text-muted-foreground">Updated</p>
      <p className="font-semibold tabular-nums text-foreground">
        {ageSec === null ? "—" : ageSec < 5 ? "just now" : `${ageSec}s ago`}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          · next in {nextIn}s
        </span>
      </p>
    </div>
  );
}

function LiveBand({
  data,
  updatedAt,
  onRefresh,
  isFetching,
}: {
  data: DemoSummary;
  updatedAt: number;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const peak = useMemo(() => {
    let best = { seconds: 0, day: 0, hour: 0 };
    for (const h of data.hours) {
      if (h.seconds > best.seconds) best = h;
    }
    return best;
  }, [data.hours]);

  return (
    <Card className="overflow-hidden border-brand-teal/20 bg-gradient-to-r from-brand-teal-50/60 via-card to-card dark:border-brand-teal/40 dark:from-brand-teal/25">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <LiveDot />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live right now
            </p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {data.totals.activeNow}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {data.totals.activeNow === 1
                  ? "visitor exploring"
                  : "visitors exploring"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Sessions · 24h</p>
            <p className="font-semibold tabular-nums text-foreground">
              {data.totals.sessionsToday}
            </p>
          </div>
          <div className="h-8 w-px bg-border" aria-hidden />
          <div>
            <p className="text-xs text-muted-foreground">Busiest hour</p>
            <p className="font-semibold tabular-nums text-foreground">
              {peak.seconds > 0
                ? `${DAY_NAMES[peak.day]} · ${String(peak.hour).padStart(2, "0")}:00 UTC`
                : "—"}
            </p>
          </div>
          <div className="h-8 w-px bg-border" aria-hidden />
          <UpdatedStat updatedAt={updatedAt} />
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            aria-label="Refresh data"
          >
            <RefreshCw
              className={cn("size-4", isFetching && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Trend chart (logins bars + watch-time area, dual axis) ───────────────

function TrendChart({ trend }: { trend: DemoSummary["trend"] }) {
  const points = trend.map((t) => ({
    date: t.date.slice(5),
    logins: t.logins,
    hours: +(t.durationSeconds / 3600).toFixed(2),
  }));

  return (
    <Card>
      <CardHeader
        title="Logins & watch time"
        subtitle="Daily demo logins (bars) and total explored time (line) — last 14 days"
        action={
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: "hsl(var(--chart-1))" }}
                aria-hidden
              />
              Logins
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: "hsl(var(--chart-2))" }}
                aria-hidden
              />
              Watch time
            </span>
          </div>
        }
      />
      <div className="px-5 py-4">
        <ChartContainer config={{}} className="h-[260px] w-full">
          <ComposedChart
            data={points}
            margin={{ top: 8, right: 8, left: -14, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="demo-time-gradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="hsl(var(--chart-2))"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--chart-2))"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={18}
              fontSize={11}
            />
            <YAxis
              yAxisId="left"
              width={32}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              allowDecimals={false}
              domain={[0, "dataMax + 1"]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={44}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={fmtHoursTick}
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const logins = payload[0]?.value ?? 0;
                const hours = payload[1]?.value ?? 0;
                return (
                  <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 font-semibold text-foreground">
                      {label}
                    </p>
                    <p className="tabular-nums text-foreground">
                      {logins} {logins === 1 ? "login" : "logins"}
                    </p>
                    <p className="tabular-nums text-muted-foreground">
                      {fmtHoursTick(Number(hours))} explored
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="logins"
              fill="hsl(var(--chart-1))"
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="hours"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              fill="url(#demo-time-gradient)"
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </Card>
  );
}

// ── Activity heatmap (7 days × 24 hours, UTC) ────────────────────────────

function ActivityHeatmap({ hours }: { hours: DemoSummary["hours"] }) {
  const max = Math.max(1, ...hours.map((h) => h.seconds));
  const byIndex = new Map(hours.map((h) => [h.day * 24 + h.hour, h.seconds]));

  return (
    <Card>
      <CardHeader
        title="When visitors explore"
        subtitle="Active time by hour — last 7 days (UTC). Darker = busier."
      />
      <div className="px-5 py-4">
        <div className="overflow-x-auto">
          <div className="min-w-[340px]">
            <div className="flex">
              <div className="w-9 shrink-0" aria-hidden />
              <div className="grid flex-1 grid-cols-24 gap-[3px]">
                {Array.from({ length: 24 }, (_, h) => (
                  <span
                    key={h}
                    className="text-center text-[9px] tabular-nums text-muted-foreground"
                  >
                    {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
                  </span>
                ))}
              </div>
            </div>
            {DAY_NAMES.map((dayName, day) => (
              <div key={dayName} className="mt-[3px] flex items-center">
                <span className="w-9 shrink-0 text-[10px] font-medium text-muted-foreground">
                  {dayName}
                </span>
                <div
                  className="grid flex-1 grid-cols-24 gap-[3px]"
                  role="img"
                  aria-label={`${dayName} activity`}
                >
                  {Array.from({ length: 24 }, (_, hour) => {
                    const seconds = byIndex.get(day * 24 + hour) ?? 0;
                    const intensity =
                      seconds === 0 ? 0 : 0.18 + 0.82 * (seconds / max);
                    return (
                      <div
                        key={hour}
                        title={`${dayName} ${String(hour).padStart(2, "0")}:00 UTC — ${fmtCompact(seconds)} active`}
                        className="aspect-square rounded-[3px] border border-black/5 dark:border-white/5"
                        style={{
                          backgroundColor:
                            seconds === 0
                              ? "hsl(var(--muted))"
                              : `hsl(var(--chart-2) / ${intensity.toFixed(2)})`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          Less
          {[0.15, 0.4, 0.65, 0.9].map((o) => (
            <span
              key={o}
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: `hsl(var(--chart-2) / ${o})` }}
            />
          ))}
          More
        </div>
      </div>
    </Card>
  );
}

// ── Globe + country leaderboard ──────────────────────────────────────────

function GlobeSection({ countries }: { countries: DemoSummary["countries"] }) {
  const [locked, setLocked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const focusCountry = locked ?? hovered;

  const totalSessions = countries.reduce((s, c) => s + c.sessions, 0) || 1;
  const maxSessions = Math.max(1, ...countries.map((c) => c.sessions));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Where visitors are from"
        subtitle="Country from IP at login — hover a row to find it on the globe, click to lock"
        action={<Globe2 className="size-4 text-muted-foreground" aria-hidden />}
      />
      <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
        <DemoGlobe markers={countries} focusCountry={focusCountry} />
        <div>
          {countries.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              No located visitors yet. Countries appear here (and on the globe)
              as demo logins come in from outside your network.
            </p>
          )}
          {countries.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              {/* Header */}
              <div className="grid grid-cols-[minmax(140px,1fr)_84px_64px_64px] items-center gap-2 bg-muted/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Country</span>
                <span className="text-right">Logins</span>
                <span className="text-right">Watch</span>
                <span className="text-right">Share</span>
              </div>
              <ul className="divide-y divide-border">
                {countries.slice(0, 9).map((c) => {
                  const share = Math.round((c.sessions / totalSessions) * 100);
                  const isFocused = focusCountry === c.country;
                  return (
                    <li key={c.country}>
                      <button
                        type="button"
                        onMouseEnter={() => setHovered(c.country)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() =>
                          setLocked(locked === c.country ? null : c.country)
                        }
                        className={cn(
                          "grid w-full grid-cols-[minmax(140px,1fr)_84px_64px_64px] items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                          isFocused
                            ? "bg-brand-teal-50 dark:bg-brand-teal/25"
                            : "hover:bg-muted/50",
                        )}
                        title={`${countryName(c.country)} — ${c.sessions} ${c.sessions === 1 ? "login" : "logins"} from ${c.visitors} ${c.visitors === 1 ? "visitor" : "visitors"}${locked === c.country ? " (click to unlock)" : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Flag code={c.country} />
                          <span className="truncate font-medium text-foreground">
                            {countryName(c.country)}
                          </span>
                        </span>
                        <span className="text-right font-semibold tabular-nums text-foreground">
                          {c.sessions}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {fmtCompact(c.totalDurationSeconds)}
                        </span>
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="hidden h-1.5 w-6 overflow-hidden rounded-full bg-muted sm:block">
                            <span
                              className="block h-full rounded-full bg-brand-teal dark:bg-emerald-400"
                              style={{
                                width: `${Math.max(8, (c.sessions / maxSessions) * 100)}%`,
                              }}
                            />
                          </span>
                          <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">
                            {share}%
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Dashboard split + engagement donut ───────────────────────────────────

function DashboardsAndEngagement({
  roles,
  engagement,
}: {
  roles: DemoSummary["roles"];
  engagement: DemoSummary["engagement"];
}) {
  const totalRoleLogins = roles.reduce((s, r) => s + r.logins, 0) || 1;
  const donutData = [
    { name: "< 1 min", value: engagement.under1m, fill: "hsl(var(--chart-5))" },
    { name: "1–5 min", value: engagement.oneTo5m, fill: "hsl(var(--chart-3))" },
    {
      name: "5–20 min",
      value: engagement.fiveTo20m,
      fill: "hsl(var(--chart-2))",
    },
    {
      name: "20 min +",
      value: engagement.over20m,
      fill: "hsl(var(--chart-1))",
    },
  ];
  const engaged = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="By dashboard"
          subtitle="Logins per demo dashboard (all time)"
        />
        <ul className="space-y-4 px-5 py-4">
          {roles.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No demo logins yet.
            </li>
          )}
          {roles.map((r) => (
            <li key={r.role}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <RolePill role={r.role} />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {r.logins}
                  </span>{" "}
                  {r.logins === 1 ? "login" : "logins"} ·{" "}
                  {fmtCompact(r.totalDurationSeconds)} watched
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand-teal dark:bg-emerald-400"
                  style={{
                    width: `${Math.max(3, (r.logins / totalRoleLogins) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader
          title="Engagement"
          subtitle="Share of sessions by explored time"
        />
        <div className="flex items-center gap-4 px-5 py-4">
          <ChartContainer config={{}} className="size-[120px] shrink-0">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                innerRadius={38}
                outerRadius={56}
                strokeWidth={2}
                stroke="hsl(var(--card))"
              >
                {donutData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            </PieChart>
          </ChartContainer>
          <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
            {donutData.map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: d.fill }}
                    aria-hidden
                  />
                  {d.name}
                </span>
                <span className="tabular-nums font-medium text-foreground">
                  {engaged === 0
                    ? "—"
                    : `${Math.round((d.value / engaged) * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

// ── Top visitors ─────────────────────────────────────────────────────────

function TopVisitors({ visitors }: { visitors: DemoVisitorRow[] }) {
  const maxDuration = Math.max(
    1,
    ...visitors.map((v) => v.totalDurationSeconds),
  );

  return (
    <Card>
      <CardHeader
        title="Top visitors"
        subtitle="Ranked by total logins — “watch time” is the combined explored time across all of a visitor's logins"
      />
      <div className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-border bg-muted/60 hover:bg-transparent">
              <TableHead className="w-[9%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visitor
              </TableHead>
              <TableHead
                className="w-[7%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Total demo logins from this browser (all time)"
              >
                Logins
              </TableHead>
              <TableHead
                className="w-[7%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Logins in the last 7 days"
              >
                7d
              </TableHead>
              <TableHead
                className="w-[14%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Combined explored time across ALL of this visitor's logins"
              >
                Total watch time
              </TableHead>
              <TableHead
                className="w-[6%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Distinct days this visitor came back"
              >
                Days
              </TableHead>
              <TableHead className="w-[15%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Last seen
              </TableHead>
              <TableHead className="w-[12%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Location
              </TableHead>
              <TableHead
                className="w-[12%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Most recent IP address this visitor connected from"
              >
                IP address
              </TableHead>
              <TableHead
                className="w-[8%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Captured events: tabs opened + API calls their browser made"
              >
                Events
              </TableHead>
              <TableHead
                className="w-[5%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="What this visitor opened and which API calls their browser made"
              >
                <span className="sr-only">Activity</span>
              </TableHead>
              <TableHead className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Identity
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitors.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No demo traffic captured yet.
                </TableCell>
              </TableRow>
            )}
            {visitors.map((v) => (
              <TableRow
                key={v.visitorId}
                className="border-border/60 transition-colors hover:bg-muted/40"
              >
                <TableCell className="px-3 py-3">
                  <VisitorChip id={v.visitorId} />
                </TableCell>
                <TableCell className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                  {v.logins}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {v.logins7d}
                </TableCell>
                <TableCell className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <span className="tabular-nums text-foreground">
                      {fmtDuration(v.totalDurationSeconds)}
                    </span>
                    <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-muted sm:block">
                      <span
                        className="block h-full rounded-full bg-brand-teal dark:bg-emerald-400"
                        style={{
                          width: `${(v.totalDurationSeconds / maxDuration) * 100}%`,
                        }}
                      />
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {v.activeDays}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-3 text-sm text-foreground">
                  {fmtDateTime(v.lastSeenAt)}
                  <span
                    className="ml-1.5 text-xs text-muted-foreground"
                    title={
                      v.lastSeenAt
                        ? new Date(v.lastSeenAt).toLocaleString()
                        : undefined
                    }
                  >
                    ({fmtRelative(v.lastSeenAt)})
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-3 text-sm">
                  {v.country ? (
                    <span
                      className="flex items-center gap-1.5"
                      title={`${countryName(v.country)} (${v.country}) · from IP ${v.lastIpAddress ?? "unknown"}`}
                    >
                      <Flag code={v.country} />
                      <span className="truncate text-foreground">
                        {countryName(v.country)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Unknown
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-3 py-3">
                  <IpCell ip={v.lastIpAddress} />
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {v.activityCount === undefined ? (
                    "—"
                  ) : v.activityCount > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        openActivity({
                          kind: "visitor",
                          id: v.visitorId,
                          title: `Visitor #${shortVisitor(v.visitorId)}`,
                        })
                      }
                      className="cursor-pointer underline decoration-dotted underline-offset-4 transition-colors hover:text-brand-teal dark:hover:text-emerald-400"
                      title="Click to see what they did"
                    >
                      {v.activityCount.toLocaleString()}
                    </button>
                  ) : (
                    <span title="No events captured for this visitor yet">
                      0
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-3 py-3">
                  <ActivityButton
                    label="View visitor activity"
                    onClick={() =>
                      openActivity({
                        kind: "visitor",
                        id: v.visitorId,
                        title: `Visitor #${shortVisitor(v.visitorId)}`,
                      })
                    }
                  />
                </TableCell>
                <TableCell className="px-3 py-3">
                  {v.lead ? (
                    <a
                      href={`mailto:${v.lead.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block max-w-52 truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      title={`Email ${v.lead.email}${v.lead.name ? ` · ${v.lead.name}` : ""}`}
                    >
                      {v.lead.email}
                    </a>
                  ) : v.frequent ? (
                    <span
                      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
                      style={{ backgroundColor: "rgba(59,130,246,0.14)" }}
                      title="Many logins in a short window — looks like a prospect evaluating the product"
                    >
                      Frequent
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Anonymous
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ── Sessions (raw list, live status, expandable rows) ────────────────────

function SessionsSection() {
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const now = useNow(5000);

  const { data, isPending, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["admin", "demo-sessions", page, roleFilter],
    queryFn: () =>
      getDemoSessions({
        page,
        limit: PAGE_SIZE,
        demoRole: roleFilter || undefined,
      }),
    refetchInterval: 30_000,
  });

  const statusOf = (s: { endedAt: string | null; lastSeenAt: string }) => {
    if (s.endedAt)
      return {
        label: "Ended",
        cls: "text-muted-foreground",
        bg: "rgba(120,120,120,0.12)",
        dot: null,
      };
    const idle = now - new Date(s.lastSeenAt).getTime() > 3 * 60 * 1000;
    if (idle)
      return {
        label: "Idle",
        cls: "text-amber-700 dark:text-amber-300",
        bg: "rgba(245,158,11,0.16)",
        dot: "bg-amber-500",
      };
    return {
      label: "Live",
      cls: "text-emerald-700 dark:text-emerald-300",
      bg: "rgba(16,185,129,0.14)",
      dot: "bg-emerald-500",
    };
  };

  return (
    <Card>
      <CardHeader
        title="Sessions"
        subtitle="Every demo login — “session time” is explored time for that single login. Live sessions end within minutes of the visitor leaving. Click a row for full details."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh sessions"
            >
              <RefreshCw
                className={cn("size-4", isFetching && "animate-spin")}
                aria-hidden
              />
            </Button>
            <select
              id="demo-role-filter"
              aria-label="Filter by dashboard"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 cursor-pointer rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <option value="">All dashboards</option>
              <option value="ADMIN">Admin</option>
              <option value="AGENT">Agent</option>
              <option value="USER">Customer</option>
            </select>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-border bg-muted/60 hover:bg-transparent">
              <TableHead className="w-[11%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dashboard
              </TableHead>
              <TableHead className="w-[9%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visitor
              </TableHead>
              <TableHead
                className="w-[15%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="When this demo login started (your local timezone)"
              >
                Login time
              </TableHead>
              <TableHead
                className="w-[11%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Time spent exploring in THIS single login — visitors' combined totals live in the Top visitors table"
              >
                Session time
              </TableHead>
              <TableHead className="w-[9%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead
                className="w-[13%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="Country resolved from the visitor's IP at login"
              >
                Location
              </TableHead>
              <TableHead className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                IP address
              </TableHead>
              <TableHead
                className="w-[5%] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                title="What this visitor opened and which API calls their browser made during this login"
              >
                <span className="sr-only">Activity</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isPending && (data?.items.length ?? 0) === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No sessions match this filter.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((s) => {
              const st = statusOf(s);
              const isOpen = expanded === s.id;
              return (
                <FragmentRow
                  key={s.id}
                  session={s}
                  status={st}
                  open={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : s.id)}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm">
        <span className="tabular-nums text-muted-foreground">
          {(data?.total ?? 0).toLocaleString()} sessions
          <span className="ml-2">
            · updated {Math.max(0, Math.floor((now - dataUpdatedAt) / 1000))}s
            ago
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="min-w-16 text-center tabular-nums text-muted-foreground">
            {page} / {data?.totalPages ?? 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= (data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** One session row + its expandable detail row (device, full visitor ID…). */
function FragmentRow({
  session: s,
  status: st,
  open,
  onToggle,
}: {
  session: DemoSessionRow;
  status: { label: string; cls: string; bg: string; dot: string | null };
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "cursor-pointer border-border/60 transition-colors",
          open ? "bg-muted/40" : "hover:bg-muted/40",
        )}
      >
        <TableCell className="px-3 py-3">
          <span className="flex items-center gap-1.5">
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
            <RolePill role={s.demoRole} />
          </span>
        </TableCell>
        <TableCell className="px-3 py-3">
          <VisitorChip id={s.visitorId} />
        </TableCell>
        <TableCell className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-foreground">
          {fmtDateTime(s.loginAt)}
        </TableCell>
        <TableCell className="px-3 py-3 text-right tabular-nums text-foreground">
          {fmtDuration(s.durationSeconds)}
        </TableCell>
        <TableCell className="px-3 py-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
              st.cls,
            )}
            style={{ backgroundColor: st.bg }}
            title={
              s.endedAt
                ? `Ended ${fmtDateTime(s.endedAt)}`
                : "The visitor's browser is still heartbeating"
            }
          >
            {st.dot ? (
              <span
                className={cn("size-1.5 rounded-full", st.dot)}
                aria-hidden
              />
            ) : null}
            {st.label}
          </span>
        </TableCell>
        <TableCell className="px-3 py-3">
          {s.country ? (
            <span
              className="flex items-center gap-1.5 text-sm"
              title={`${countryName(s.country)} (${s.country})`}
            >
              <Flag code={s.country} />
              <span className="truncate text-foreground">
                {countryName(s.country)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Unknown</span>
          )}
        </TableCell>
        <TableCell className="px-3 py-3">
          <IpCell ip={s.ipAddress} />
        </TableCell>
        <TableCell className="px-3 py-3 text-right">
          <ActivityButton
            label="View session activity"
            onClick={() =>
              openActivity({
                kind: "session",
                id: s.id,
                title: `Session ${fmtDateTime(s.loginAt)} — ${ROLE_LABELS[s.demoRole] ?? s.demoRole}`,
              })
            }
          />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="border-border/60 px-3 pb-4 pt-1">
            <div
              className="rounded-lg bg-muted/50 p-4"
              style={{ backgroundColor: "rgba(120,120,120,0.08)" }}
            >
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Visitor ID
                  </p>
                  <div className="mt-1">
                    <VisitorChip id={s.visitorId} full />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Device
                  </p>
                  <p className="mt-1 text-foreground">
                    {deviceFromUa(s.userAgent)}
                  </p>
                  {s.userAgent && (
                    <p
                      className="mt-0.5 max-w-64 truncate text-[11px] text-muted-foreground"
                      title={s.userAgent}
                    >
                      {s.userAgent}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Last heartbeat
                  </p>
                  <p className="mt-1 tabular-nums text-foreground">
                    {fmtDateTime(s.lastSeenAt)}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({fmtRelative(s.lastSeenAt)})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Ended
                  </p>
                  <p className="mt-1 tabular-nums text-foreground">
                    {s.endedAt ? fmtDateTime(s.endedAt) : "Still open"}
                  </p>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Activity viewer (what did this visitor/session do?) ───────────────────

type ActivityRequest = {
  kind: "session" | "visitor";
  id: string;
  title: string;
};

/** Registered by the single <DemoActivityViewer /> instance on mount. */
let openActivityFn: ((req: ActivityRequest) => void) | null = null;

/** Open the activity modal for a session or a whole visitor. */
function openActivity(req: ActivityRequest): void {
  openActivityFn?.(req);
}

function ActivityButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-brand-teal/40 hover:bg-brand-teal-50 hover:text-brand-teal dark:hover:bg-brand-teal/25 dark:hover:text-emerald-300"
    >
      <Eye className="size-3.5" aria-hidden />
    </button>
  );
}

/** Icon for one activity row. */
function activityIcon(type: DemoActivityRow["type"]): {
  Icon: LucideIcon;
  cls: string;
  bg: string;
  tag: string;
} {
  if (type === "page") {
    return {
      Icon: MousePointerClick,
      cls: "text-blue-700 dark:text-blue-300",
      bg: "rgba(59,130,246,0.14)",
      tag: "Tab",
    };
  }
  return {
    Icon: GlobeIcon,
    cls: "text-violet-700 dark:text-violet-300",
    bg: "rgba(139,92,246,0.14)",
    tag: "API",
  };
}

/** Human label for a captured API call ("GET /flights/offers"). */
function prettyApiLabel(label: string): string {
  const [method, ...rest] = label.split(" ");
  const path = rest.join(" ").replace(/^\/api\/v1/, "") || "/";
  return `${method} ${path}`;
}

function DemoActivityViewer() {
  const [req, setReq] = useState<ActivityRequest | null>(null);
  const [filter, setFilter] = useState<"all" | "page" | "api">("all");
  useEffect(() => {
    openActivityFn = (r) => {
      setReq(r);
      setFilter("all");
    };
    return () => {
      openActivityFn = null;
    };
  }, []);

  const { data, isPending } = useQuery({
    queryKey: ["admin", "demo-activities", req?.kind, req?.id],
    queryFn: () =>
      req?.kind === "visitor"
        ? getDemoVisitorActivities(req.id)
        : getDemoSessionActivities(req?.id ?? ""),
    enabled: !!req,
  });

  const items = data?.items ?? [];
  const shown =
    filter === "all" ? items : items.filter((a) => a.type === filter);
  const pageEvents = items.filter((a) => a.type === "page").length;
  const apiEvents = items.length - pageEvents;

  return (
    <Modal
      adminSurface
      isOpen={!!req}
      onClose={() => setReq(null)}
      className="w-full max-w-2xl"
      title={req ? `Activity — ${req.title}` : "Activity"}
    >
      <div className="max-h-[65vh] overflow-y-auto">
        {isPending && (
          <div className="space-y-2 py-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        )}
        {!isPending && items.length > 0 && (
          <div className="mb-3 flex items-center gap-1.5">
            {(
              [
                ["all", `All (${items.length})`],
                ["page", `Tabs (${pageEvents})`],
                ["api", `API (${apiEvents})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  filter === key
                    ? "bg-brand-teal text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!isPending && items.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              No activity captured yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Tabs the visitor opens and API calls their browser makes will
              appear here. Activity capture starts with the next login.
            </p>
          </div>
        )}
        {!isPending && shown.length > 0 && (
          <ol className="relative space-y-1 border-l border-gray-200 pl-4 dark:border-gray-800">
            {shown.map((a) => {
              const { Icon, cls, bg, tag } = activityIcon(a.type);
              const d = new Date(a.createdAt);
              return (
                <li
                  key={a.id}
                  className="relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  <span
                    className={`absolute -left-[21px] flex size-5 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900 ${cls}`}
                    style={{ backgroundColor: bg }}
                  >
                    <Icon className="size-3" aria-hidden />
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
                    style={{ backgroundColor: bg }}
                  >
                    {tag}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs text-gray-900 dark:text-gray-100"
                    title={a.type === "api" ? prettyApiLabel(a.label) : a.label}
                  >
                    {a.type === "api" ? prettyApiLabel(a.label) : a.label}
                  </span>
                  <span
                    className="shrink-0 tabular-nums text-[11px] text-gray-400 dark:text-gray-500"
                    title={d.toLocaleString()}
                  >
                    {d.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {items.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800">
          <JourneyBreadcrumb items={items} />
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {items.length} events · newest first · repeated API calls to the
            same endpoint are grouped to one entry per minute
          </p>
        </div>
      )}
    </Modal>
  );
}
// ── Watch Now — what actively exploring visitors are doing this second ──

/** Tiny journey path: pages opened by a visitor, oldest → newest. */
function JourneyBreadcrumb({ items }: { items: DemoActivityRow[] }) {
  const pages = items
    .filter((a) => a.type === "page")
    .map((a) => a.label)
    .reverse();
  if (pages.length === 0) return null;
  const shown = pages.slice(-5);
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      title="Pages this visitor walked through, in order"
    >
      {shown.map((p, i) => (
        <span key={`${i}-${p}`} className="flex items-center gap-1">
          {i > 0 && (
            <ArrowRight
              className="size-3 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
          )}
          <span className="max-w-40 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {p === "/" ? "home" : p.replace(/^\//, "")}
          </span>
        </span>
      ))}
      {pages.length > shown.length && (
        <span className="text-[10px] text-muted-foreground">
          +{pages.length - shown.length} more
        </span>
      )}
    </div>
  );
}

const WATCH_ROLE_STYLES: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  admin: { bg: "rgba(59,130,246,0.14)", fg: "#1d4ed8", label: "Admin" },
  agent: { bg: "rgba(139,92,246,0.14)", fg: "#6d28d9", label: "Agent" },
  user: { bg: "rgba(245,158,11,0.16)", fg: "#b45309", label: "Customer" },
};

function WatchNowPanel({ enabled }: { enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ["admin", "demo-sessions", "watch-now"],
    queryFn: getDemoWatchNow,
    enabled,
    refetchInterval: 15_000,
  });

  const items = data?.items ?? [];
  if (!enabled || items.length === 0) return null;

  return (
    <Card className="border-blue-500/20 bg-gradient-to-r from-blue-500/5 via-card to-card dark:border-blue-400/30">
      <CardHeader
        icon={
          <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500 text-white">
            <Radio className="size-4" aria-hidden />
          </span>
        }
        title="Watching right now"
        subtitle={
          <>
            Live feed — what actively exploring visitors are doing, refreshed
            every 15s
          </>
        }
      />
      <div className="space-y-2 px-5 pb-5">
        {items.map((w) => {
          const role = WATCH_ROLE_STYLES[w.role] ?? {
            bg: "rgba(107,114,128,0.14)",
            fg: "#374151",
            label: w.role,
          };
          const last = w.recent[0];
          return (
            <div
              key={w.sessionId}
              className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 transition-colors hover:border-blue-500/30"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: role.bg, color: role.fg }}
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  {role.label} live
                </span>
                <VisitorChip id={w.visitorId} />
                {w.country && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Flag code={w.country} />
                    {countryName(w.country)}
                  </span>
                )}
                <span
                  className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                  title="Explored time in this live session"
                >
                  {fmtDuration(w.durationSeconds)} so far
                </span>
                <span className="ml-auto">
                  <ActivityButton
                    label="View this session's activity"
                    onClick={() =>
                      openActivity({
                        kind: "session",
                        id: w.sessionId,
                        title: `Live session — Visitor #${shortVisitor(w.visitorId)}`,
                      })
                    }
                  />
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {last ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                    title={
                      last.type === "api"
                        ? prettyApiLabel(last.label)
                        : last.label
                    }
                  >
                    {last.type === "page" ? (
                      <MousePointerClick
                        className="size-3.5 text-blue-500"
                        aria-hidden
                      />
                    ) : (
                      <Globe2
                        className="size-3.5 text-violet-500"
                        aria-hidden
                      />
                    )}
                    <span className="max-w-72 truncate font-mono text-[11px] text-foreground">
                      {last.type === "api"
                        ? prettyApiLabel(last.label)
                        : last.label}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Exploring — no events captured yet
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Overview (summary query) ─────────────────────────────────────────────

function TrafficOverview() {
  const { data, isPending, isError, dataUpdatedAt, refetch, isFetching } =
    useQuery({
      queryKey: ["admin", "demo-sessions", "summary"],
      queryFn: getDemoSummary,
      refetchInterval: 30_000,
    });

  if (isPending) {
    return (
      <div className="grid gap-4">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Failed to load demo analytics.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try refreshing the page.
        </p>
      </Card>
    );
  }

  const empty = data.totals.sessions === 0;

  if (empty) {
    return (
      <Card className="p-14 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-teal-50 dark:bg-brand-teal/30">
          <Activity
            className="size-6 text-brand-teal dark:text-emerald-400"
            aria-hidden
          />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          No demo traffic yet
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Share the demo credentials with a prospect — the moment they sign in,
          their visit appears here live: duration, pages of the dashboard, and
          country.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DemoActivityViewer />
      <LiveBand
        data={data}
        updatedAt={dataUpdatedAt}
        onRefresh={() => void refetch()}
        isFetching={isFetching}
      />

      {/* Live "what are they doing right now" feed (own 15s polling). */}
      <WatchNowPanel enabled={data.totals.activeNow > 0} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          icon={<Users className="size-4" aria-hidden />}
          label="Visitors"
          value={data.totals.uniqueVisitors.toLocaleString()}
          hint="Unique browsers (localStorage ID)"
          accent="bg-blue-500 text-white"
        />
        <KpiCard
          icon={<LogIn className="size-4" aria-hidden />}
          label="Demo logins"
          value={data.totals.sessions.toLocaleString()}
          hint={`${data.totals.logins7d} in the last 7 days`}
          accent="bg-violet-500 text-white"
        />
        <KpiCard
          icon={<Timer className="size-4" aria-hidden />}
          label="Avg session"
          value={fmtDuration(data.totals.avgDurationSeconds)}
          hint="Average explored time per login"
          accent="bg-amber-500 text-white"
        />
        <KpiCard
          icon={<Clock className="size-4" aria-hidden />}
          label="Total watch time"
          value={fmtCompact(data.totals.totalDurationSeconds)}
          hint="All logins combined"
          accent="bg-emerald-500 text-white"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart trend={data.trend} />
        <ActivityHeatmap hours={data.hours} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3">
          <GlobeSection countries={data.countries} />
        </div>
        <div className="lg:col-span-2">
          <DashboardsAndEngagement
            roles={data.roles}
            engagement={data.engagement}
          />
        </div>
      </div>

      <TopVisitors visitors={data.topVisitors} />
      <SessionsSection />
    </div>
  );
}

// ── Page (super-admin gated) ─────────────────────────────────────────────

export default function DemoLeadsPage() {
  const router = useRouter();
  const { user, isAuthLoading } = useAuth();

  useEffect(() => {
    if (!isAuthLoading && !isRealSuperAdmin(user?.email)) {
      router.replace("/admin/forbidden");
    }
  }, [isAuthLoading, user?.email, router]);

  if (isAuthLoading || !isRealSuperAdmin(user?.email)) return null;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Demo Intelligence"
        description="Live analytics for your demo dashboards — who is exploring, from where, for how long. Visible only to you."
      />
      <TrafficOverview />
    </div>
  );
}
