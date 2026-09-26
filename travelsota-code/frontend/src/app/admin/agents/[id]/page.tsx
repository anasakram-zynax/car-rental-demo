'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { pushToast } from "@/lib/toast";
import { promptDialog } from "@/components/ui/prompt-dialog";
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { getAgent, approveAgent, rejectAgent, assignAgentRole, updateAgent, getAgentMarkups, setAgentMarkups, getAdminAgentWallet, getAdminAgentWalletTransactions, setAdminCreditLimit, adminAdjustWalletBalance, listTopupRequests, approveTopupRequest, rejectTopupRequest, listWalletWithdrawals, approveWalletWithdrawal, rejectWalletWithdrawal, getAgentEffectivePermissions, setAgentPermissionOverrides, type AgentUser, type AgentProfile, type AgentMarkupRule, type AdminWalletBalance, type AgentEffectivePermissions } from '@/features/admin/api/admin-agents';
import { listCommissionWithdrawals, approveCommissionWithdrawal, rejectCommissionWithdrawal } from '@/features/admin/api/admin-commission';
import { getRoles } from '@/features/admin/api/admin-users';
import { getMarkupTemplates } from '@/features/admin/api/admin-markups';
import { getAgentInvoices, type AgentInvoiceItem } from '@/features/admin/api/admin-documents';
import { getAdminInvoicePdfUrl } from '@/features/invoices/api/admin-invoices';
import { getAdminAgentBookingFeed, type AgentBookingFeedItem } from '@/features/admin/api/admin-bookings';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode, PERMISSION_GROUPS } from '@/lib/permissions';
import { ChevronLeftIcon, PencilIcon, CheckCircleIcon, CloseLineIcon, UserCircleIcon } from '@/icons';
import { ModalErrorBoundary } from '@/features/wallet/components/ModalErrorBoundary';
import { InfoTip } from '@/components/ui/stat-card';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { Bar, BarChart, CartesianGrid, Legend, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

type DetailTab = 'overview' | 'bookings' | 'financial' | 'pricing' | 'subagents' | 'access';

const DETAIL_TABS: { key: DetailTab; label: string; hint: string }[] = [
  { key: 'overview', label: 'Overview', hint: 'Profile, company, status & trend' },
  { key: 'bookings', label: 'Bookings', hint: 'Booking activity, invoices & documents' },
  { key: 'financial', label: 'Financial', hint: 'Wallet, credit, payouts & history' },
  { key: 'pricing', label: 'Pricing', hint: 'Markup rules & pricing mode' },
  { key: 'subagents', label: 'Subagents', hint: 'Sub-agent hierarchy & limits' },
  { key: 'access', label: 'Access', hint: 'Role & permission overrides' },
];

// ponytail: allowlist fields exist on the backend PATCH DTO but the frontend
// updateAgent/AgentProfile types omit them — extend additively here, no api-file churn.
type AgentProfileUpdate = Parameters<typeof updateAgent>[1] & {
  allowedFlightProviders?: string[] | null;
  allowedHotelProviders?: string[] | null;
  allowedGateways?: string[] | null;
};
type ProfileWithAllowlists = AgentProfile & {
  allowedFlightProviders?: string[] | null;
  allowedHotelProviders?: string[] | null;
  allowedGateways?: string[] | null;
};

const FLIGHT_PROVIDER_OPTIONS = ['travelport', 'duffel', 'amadeus', 'manual'];
const HOTEL_PROVIDER_OPTIONS = ['hotelbeds', 'ratehawk', 'amadeus', 'travelport-stays', 'manual'];
const GATEWAY_OPTIONS = ['stripe', 'paypal', 'bank_transfer', 'pay_later'];

const bookingTrendConfig = {
  flights: { label: 'Flights', color: 'hsl(var(--chart-2))' },
  hotels: { label: 'Hotels', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

// ponytail: null = all allowed (backend treats null/empty the same).
function AllowlistGroup({ label, hint, options, value, onToggle, onClear }: {
  label: string;
  hint: string;
  options: string[];
  value: string[] | null;
  onToggle: (opt: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground" title={hint}>{label}</p>
        <div className="flex items-center gap-2">
          {value === null ? (
            <span className="inline-flex items-center rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400">
              All allowed
            </span>
          ) : (
            <button
              onClick={onClear}
              className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-muted-foreground underline hover:text-foreground"
            >
              Clear (allow all)
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value !== null && value.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              aria-pressed={selected}
              title={selected ? `${opt}: allowed — click to remove` : `${opt}: not restricted — click to restrict to this only`}
              className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? 'bg-brand-teal-500 text-white shadow-sm'
                  : 'border border-input bg-card text-muted-foreground hover:border-brand-teal-300 hover:text-brand-teal-600 dark:hover:border-brand-teal-600 dark:hover:text-brand-teal-400'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ponytail: agent:* display metadata lives here, not in lib/permissions.
const AGENT_FRIENDLY_NAMES: Record<string, string> = {
  'agent:book_flights': 'Book flights',
  'agent:book_hotels': 'Book hotels',
  'agent:view_own_bookings': 'View bookings',
  'agent:cancel_bookings': 'Cancel bookings',
  'agent:modify_bookings': 'Modify bookings',
  'agent:view_reports': 'View reports',
  'agent:export_reports': 'Export reports',
  'agent:access_insights': 'Access insights',
  'agent:view_commission': 'View commission',
  'agent:use_wallet': 'Spend from wallet',
  'agent:view_wallet': 'View wallet',
  'agent:topup_wallet': 'Top-up wallet',
  'agent:withdraw_funds': 'Withdraw funds',
  'agent:use_credit': 'Use credit line',
  'agent:manage_customers': 'Manage customers',
  'agent:view_pricing': 'View pricing',
  'agent:manage_sub_agents': 'Manage sub-agents',
};

const AGENT_OVERRIDE_GROUPS: { header: string; codes: string[] }[] = [
  { header: 'Booking', codes: ['agent:book_flights', 'agent:book_hotels', 'agent:view_own_bookings', 'agent:cancel_bookings', 'agent:modify_bookings'] },
  { header: 'Finance', codes: ['agent:view_commission', 'agent:use_wallet', 'agent:view_wallet', 'agent:topup_wallet', 'agent:withdraw_funds', 'agent:use_credit'] },
  { header: 'Analytics', codes: ['agent:view_reports', 'agent:export_reports', 'agent:access_insights'] },
  { header: 'Customers & Pricing', codes: ['agent:manage_customers', 'agent:view_pricing'] },
  { header: 'Team', codes: ['agent:manage_sub_agents'] },
];

// ponytail: button-based switch, no new dep. Inner track centers in a 44px row.
function SettingToggle({ checked, onChange, label, disabled }: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${checked ? 'justify-end bg-brand-teal-500' : 'justify-start bg-muted'}`}>
        <span className="h-5 w-5 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  const { data: agent, isPending } = useQuery<AgentUser | null>({
    queryKey: ['admin', 'agent', id],
    queryFn: () => getAgent(id),
    enabled: !!id,
  });

  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const { data: roles } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => getRoles(),
    enabled: (activeTab === 'access' || activeTab === 'subagents') && !!id,
  });

  // Filter roles to only agent roles — uses a backend-assigned flag rather than brittle string matching
  const agentRoleOptions = useMemo(() => {
    return (roles ?? [])
      .filter((r) => r.name.toLowerCase().includes('agent'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roles]);

  const approveMutation = useMutation({
    mutationFn: () => approveAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      toasts.success('Agent approved', 'The agent has been approved.');
    },
    onError: () => toasts.error('Failed to approve agent'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectAgent(id, rejectReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      setShowRejectModal(false);
      setRejectReason('');
      toasts.success('Agent rejected', 'The agent registration has been rejected.');
    },
    onError: () => toasts.error('Failed to reject agent'),
  });

  const roleMutation = useMutation({
    mutationFn: (roleId: string) => assignAgentRole(id, roleId),
    onSuccess: (_res, roleId) => {
      // Keep the select in sync immediately — don't wait for the refetch
      setSelectedRoleId(roleId);
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id, 'effective-permissions'] });
      toasts.success('Role assigned', 'Agent role has been updated.');
    },
    onError: () => toasts.error('Failed to assign role'),
  });

  // ── Subagents tab (full control surface, single Save bar via updateAgent) ──
  const [subDirty, setSubDirty] = useState(false);
  const [subForm, setSubForm] = useState({
    canManageSubAgents: false,
    maxSubAgents: '',
    maxCreditPerSub: '',
    allowedSubAgentRoleIds: [] as string[],
    inheritMarkups: false,
    inheritCommission: false,
    segregatedCredit: false,
    subAgentDefaultRoleId: '',
  });
  const setSub = (patch: Partial<typeof subForm>) => {
    setSubForm((f) => ({ ...f, ...patch }));
    setSubDirty(true);
  };
  const resetSubForm = () => {
    const p = agent?.agentProfile;
    setSubForm({
      canManageSubAgents: p?.canManageSubAgents ?? false,
      maxSubAgents: p?.maxSubAgents != null ? String(p.maxSubAgents) : '',
      maxCreditPerSub: p?.maxCreditPerSub != null ? String(p.maxCreditPerSub) : '',
      allowedSubAgentRoleIds: p?.allowedSubAgentRoleIds ?? [],
      inheritMarkups: p?.inheritMarkups ?? false,
      inheritCommission: p?.inheritCommission ?? false,
      segregatedCredit: p?.segregatedCredit ?? false,
      subAgentDefaultRoleId: p?.subAgentDefaultRoleId ?? '',
    });
    setSubDirty(false);
  };
  const subSeedRev = agent?.agentProfile?.updatedAt ?? agent?.id ?? '';
  useEffect(() => {
    if (subDirty) return;
    resetSubForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSeedRev]);

  // ── Wallet State ──────────────────────────────────────────
  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const { data: wallet, refetch: refetchWallet } = useQuery<{ wallet: AdminWalletBalance | null }>({
    queryKey: ['admin', 'agent', id, 'wallet'],
    queryFn: () => getAdminAgentWallet(id),
    enabled: activeTab === 'financial' && !!id,
  });

  const [walletTxnPage, setWalletTxnPage] = useState(1);
  const { data: walletTxns } = useQuery({
    queryKey: ['admin', 'agent', id, 'wallet-transactions', walletTxnPage],
    queryFn: () => getAdminAgentWalletTransactions(id, { page: walletTxnPage, limit: 10 }),
    enabled: activeTab === 'financial' && !!id,
  });

  // ── Bookings feed (scoped to this agent) ───────────────────
  const { data: bookingsFeed, isPending: bookingsPending } = useQuery({
    queryKey: ['admin', 'agent', id, 'bookings'],
    queryFn: () => getAdminAgentBookingFeed({ agentId: id, limit: 10 }),
    enabled: (activeTab === 'bookings' || activeTab === 'overview') && !!id,
  });

  const creditLimitMutation = useMutation({
    mutationFn: (limit: number) => setAdminCreditLimit(id, limit),
    onSuccess: (res) => {
      refetchWallet();
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      setShowCreditLimitModal(false);
      toasts.success('Credit limit updated', `Set to ${formatCurrencyWithCode(res.creditLimit, wCur, decimalsMap)}.`);
    },
    onError: () => toasts.error('Failed to update credit limit'),
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: ({ amount, reason }: { amount: number; reason: string }) => adminAdjustWalletBalance(id, amount, reason),
    onSuccess: (res) => {
      refetchWallet();
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      toasts.success('Balance adjusted', `Wallet ${res.type === 'deposit' ? 'credited' : 'debited'} ${formatCurrencyWithCode(Math.abs(res.amount), res.currency ?? wCur, decimalsMap)}. New balance: ${formatCurrencyWithCode(res.balanceAfter, res.currency ?? wCur, decimalsMap)}`);
    },
    onError: () => toasts.error('Failed to adjust balance'),
  });

  // ── Offline top-up requests (approve → wallet credited) ───
  const { data: topupQueue, refetch: refetchTopupQueue } = useQuery({
    queryKey: ['admin', 'topup-requests', 'pending'],
    queryFn: () => listTopupRequests('pending'),
    enabled: activeTab === 'financial' && !!id,
  });
  const approveTopupMutation = useMutation({
    mutationFn: (requestId: string) => approveTopupRequest(requestId),
    onSuccess: () => {
      refetchWallet();
      refetchTopupQueue();
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      toasts.success('Top-up approved', 'Wallet credited.');
    },
    onError: () => toasts.error('Approve failed', 'Request may already be handled.'),
  });
  const rejectTopupMutation = useMutation({
    mutationFn: (requestId: string) => rejectTopupRequest(requestId),
    onSuccess: () => {
      refetchTopupQueue();
      toasts.success('Top-up rejected', 'No money moved.');
    },
    onError: () => toasts.error('Reject failed', 'Request may already be handled.'),
  });

  // ── Withdrawal queues (wallet + commission, this agent) ───
  const { data: walletWdQueue, refetch: refetchWalletWd } = useQuery({
    queryKey: ['admin', 'wallet-withdrawals', 'pending'],
    queryFn: () => listWalletWithdrawals('pending'),
    enabled: activeTab === 'financial' && !!id,
  });
  const { data: commWdQueue, refetch: refetchCommWd } = useQuery({
    queryKey: ['admin', 'commission-withdrawals', 'pending'],
    queryFn: () => listCommissionWithdrawals('pending'),
    enabled: activeTab === 'financial' && !!id,
  });
  const [payRef, setPayRef] = useState<Record<string, string>>({});
  const approveWalletWdMutation = useMutation({
    mutationFn: ({ requestId, ref }: { requestId: string; ref?: string }) => approveWalletWithdrawal(requestId, ref),
    onSuccess: () => {
      refetchWallet();
      refetchWalletWd();
      toasts.success('Withdrawal approved', 'Locked funds released for payout.');
    },
    onError: () => toasts.error('Approve failed', 'Request may already be handled.'),
  });
  const rejectWalletWdMutation = useMutation({
    mutationFn: (requestId: string) => rejectWalletWithdrawal(requestId),
    onSuccess: () => {
      refetchWalletWd();
      toasts.success('Withdrawal rejected', 'Locked funds released back to wallet.');
    },
    onError: () => toasts.error('Reject failed', 'Request may already be handled.'),
  });
  const approveCommWdMutation = useMutation({
    mutationFn: ({ requestId, ref }: { requestId: string; ref?: string }) => approveCommissionWithdrawal(requestId, ref),
    onSuccess: () => {
      refetchCommWd();
      toasts.success('Commission payout approved', 'Current pending balance paid out.');
    },
    onError: () => toasts.error('Approve failed', 'Request may already be handled.'),
  });
  const rejectCommWdMutation = useMutation({
    mutationFn: (requestId: string) => rejectCommissionWithdrawal(requestId),
    onSuccess: () => {
      refetchCommWd();
      toasts.success('Commission payout rejected', 'No money moved.');
    },
    onError: () => toasts.error('Reject failed', 'Request may already be handled.'),
  });

  // ── Invoices State ────────────────────────────────────────
  const { data: invoices } = useQuery<{ items: AgentInvoiceItem[] }>({
    queryKey: ['admin', 'agent', id, 'invoices'],
    queryFn: () => getAgentInvoices(id),
    enabled: activeTab === 'bookings' && !!id,
  });

  // ── Effective permissions & overrides ─────────────────────
  const { data: effective, isError: effectiveError } = useQuery<AgentEffectivePermissions>({
    queryKey: ['admin', 'agent', id, 'effective-permissions'],
    queryFn: () => getAgentEffectivePermissions(id),
    enabled: activeTab === 'access' && !!id,
  });
  // ── Permission overrides: agent:* tri-state draft (grant/revoke/neutral) ──
  const [overrideSearch, setOverrideSearch] = useState('');
  const [draftGrant, setDraftGrant] = useState<string[]>([]);
  const [draftRevoke, setDraftRevoke] = useState<string[]>([]);
  const [overridesSeeded, setOverridesSeeded] = useState(false);
  const resetOverrides = () => {
    setDraftGrant(effective?.permissionOverrides?.grant ?? []);
    setDraftRevoke(effective?.permissionOverrides?.revoke ?? []);
  };
  useEffect(() => {
    if (overridesSeeded || !effective) return;
    resetOverrides();
    setOverridesSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective]);
  const overridesMutation = useMutation({
    mutationFn: (next: { grant?: string[]; revoke?: string[] } | null) => setAgentPermissionOverrides(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id, 'effective-permissions'] });
      setOverridesSeeded(false);
      toasts.success('Permissions updated', 'The agent\u2019s effective permissions have been updated.');
    },
    onError: () => toasts.error('Failed to update permission overrides'),
  });

  // ── Profile edits via updateAgent (company, pricing defaults, allowlists) ──
  const profileMutation = useMutation({
    mutationFn: (data: AgentProfileUpdate) => updateAgent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent', id] });
      refetchWallet();
      setEditingCompany(false);
      setEditingPricingDefaults(false);
      setAllowlistDirty(false);
      setSubDirty(false);
      toasts.success('Agent updated', 'Profile settings have been saved.');
    },
    onError: () => toasts.error('Failed to update agent'),
  });

  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ companyName: '', companyPhone: '', companyAddress: '', taxId: '' });
  const openCompanyEditor = (p: ProfileWithAllowlists | null) => {
    setCompanyForm({
      companyName: p?.companyName ?? '',
      companyPhone: p?.companyPhone ?? '',
      companyAddress: p?.companyAddress ?? '',
      taxId: p?.taxId ?? '',
    });
    setEditingCompany(true);
  };

  const [editingPricingDefaults, setEditingPricingDefaults] = useState(false);
  const [pricingDefaultsForm, setPricingDefaultsForm] = useState({ commissionRate: '', flightMarkup: '', hotelMarkup: '' });
  const openPricingDefaultsEditor = (p: ProfileWithAllowlists | null) => {
    setPricingDefaultsForm({
      commissionRate: String(p?.commissionRate ?? ''),
      flightMarkup: String(p?.flightMarkup ?? ''),
      hotelMarkup: String(p?.hotelMarkup ?? ''),
    });
    setEditingPricingDefaults(true);
  };

  const [flightProviders, setFlightProviders] = useState<string[] | null>(null);
  const [hotelProviders, setHotelProviders] = useState<string[] | null>(null);
  const [gateways, setGateways] = useState<string[] | null>(null);
  const [allowlistDirty, setAllowlistDirty] = useState(false);

  // ── Markup State ──────────────────────────────────────────
  const markupEditorInitialized = useRef(false);

  const { data: agentMarkups, refetch: refetchMarkups } = useQuery<AgentMarkupRule[]>({
    queryKey: ['admin', 'agent', id, 'markups'],
    queryFn: () => getAgentMarkups(id),
    enabled: activeTab === 'pricing' && !!id,
  });

  const markupsMutation = useMutation({
    mutationFn: (markups: { name: string; applyTo: string; markupType: string; markupValue: number; routeFrom?: string; routeTo?: string }[]) =>
      setAgentMarkups(id, markups),
    onSuccess: () => {
      refetchMarkups();
      // Reset the initialized flag so the editor re-syncs from the fresh data
      markupEditorInitialized.current = false;
      toasts.success('Markups saved', 'Agent markup rules have been updated.');
    },
    onError: () => toasts.error('Failed to save markups'),
  });

  const [markupEditor, setMarkupEditor] = useState<{ name: string; applyTo: string; markupType: string; markupValue: string; routeFrom: string; routeTo: string }[]>([]);

  const initMarkupEditor = () => {
    if (agentMarkups && agentMarkups.length > 0) {
      setMarkupEditor(agentMarkups.map((r) => ({
        name: r.name,
        applyTo: r.applyTo,
        markupType: r.markupType,
        markupValue: String(r.markupValue),
        routeFrom: r.routeFrom ?? '',
        routeTo: r.routeTo ?? '',
      })));
    } else {
      setMarkupEditor([
        { name: 'Flight Markup', applyTo: 'flights', markupType: 'percentage', markupValue: '', routeFrom: '', routeTo: '' },
        { name: 'Hotel Markup', applyTo: 'hotels', markupType: 'percentage', markupValue: '', routeFrom: '', routeTo: '' },
        { name: 'Package Markup', applyTo: 'packages', markupType: 'percentage', markupValue: '', routeFrom: '', routeTo: '' },
      ]);
    }
  };

  // ponytail: hooks must run before any early return — otherwise the hook
  // count changes between loading/ready renders → React #310. All inputs
  // below are undefined-safe (optional chaining / ?? fallbacks).
  const extProfile = agent?.agentProfile as ProfileWithAllowlists | null;

  // ponytail: daily aggregate from the existing bookings feed, no new endpoint.
  // Local-date keys — toISOString is UTC and shifts day buckets in +5 zones.
  const bookingTrend = useMemo(() => {
    const feed = bookingsFeed?.items ?? [];
    if (feed.length === 0) return [];
    const buckets = new Map<string, { day: string; flights: number; hotels: number }>();
    for (const b of feed) {
      const d = new Date(b.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const row = buckets.get(key) ?? { day: label, flights: 0, hotels: 0 };
      row.day = label;
      if (b.type === 'flight') row.flights += 1;
      else row.hotels += 1;
      buckets.set(key, row);
    }
    return [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-7).map(([, r]) => r);
  }, [bookingsFeed]);

  const invoiceByBooking = useMemo(() => {
    const m = new Map<string, AgentInvoiceItem>();
    for (const inv of invoices?.items ?? []) {
      if (!m.has(inv.bookingId)) m.set(inv.bookingId, inv);
    }
    return m;
  }, [invoices]);

  // Seed allowlist chips from the profile once it loads (until the admin edits).
  const profileRev = agent?.agentProfile?.updatedAt ?? agent?.id ?? '';
  useEffect(() => {
    if (allowlistDirty) return;
    setFlightProviders(extProfile?.allowedFlightProviders ?? null);
    setHotelProviders(extProfile?.allowedHotelProviders ?? null);
    setGateways(extProfile?.allowedGateways ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileRev]);

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb pageTitle="Agent Detail" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb pageTitle="Agent Detail" />
        <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card py-16 shadow-xs">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <UserCircleIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Agent not found</p>
          <p className="text-xs text-muted-foreground">The agent may have been deleted or the link is wrong.</p>
          <button onClick={() => router.back()} className="mt-1 inline-flex min-h-[44px] cursor-pointer items-center text-sm font-medium text-brand-teal-500 hover:underline">Go back</button>
        </div>
      </div>
    );
  }

  const profile = agent.agentProfile;
  const canApprove = hasPermission(PermissionCode.AGENTS_APPROVE) && profile?.kycStatus === 'PENDING';
  const canEditSub = hasPermission(PermissionCode.AGENTS_WRITE);
  const isRejected = profile?.kycStatus === 'REJECTED';

  const statusConfig = {
    PENDING: { label: 'Pending Approval', bg: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400', dot: 'bg-warning-500' },
    APPROVED: { label: 'Approved', bg: 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400', dot: 'bg-success-500' },
    REJECTED: { label: 'Rejected', bg: 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400', dot: 'bg-error-500' },
  }[profile?.kycStatus ?? 'PENDING'];

  const creditLimit = profile?.creditLimit ?? 0;
  const creditUsed = profile?.creditUsed ?? 0;
  const creditAvailable = Math.max(creditLimit - creditUsed, 0);
  const utilization = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;
  const utilizationTone = utilization >= 80 ? 'bg-error-500' : utilization > 50 ? 'bg-warning-500' : 'bg-brand-teal-500';

  // Wallet-domain currency for every money figure on this page (ops view —
  // shown as-is with code, never converted to the admin's display currency).
  const wCur = profile?.walletCurrency ?? wallet?.wallet?.currency ?? 'USD';
  const wmt = (v: number | null | undefined) => formatCurrencyWithCode(v ?? 0, wCur, decimalsMap);

  // ── Permission display helpers ────────────────────────────
  const overrideGranted = effective?.permissionOverrides?.grant ?? [];
  const overrideRevoked = effective?.permissionOverrides?.revoke ?? [];
  const hasOverrides = overrideGranted.length > 0 || overrideRevoked.length > 0;
  const permissionLabel = (code: string) => {
    const group = PERMISSION_GROUPS.find((g) => (g.codes as string[]).includes(code));
    const action = code.includes(':') ? code.split(':')[1] : code;
    return group ? group.label + ': ' + action.replace(/_/g, ' ') : code.replace(/[_:]/g, ' ');
  };

  const sameAgent = (r: { agentProfileId?: string; agentEmail?: string | null }) =>
    !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId;
  const financialPending =
    (topupQueue?.filter(sameAgent).length ?? 0) +
    ((walletWdQueue ?? []).filter(sameAgent).length ?? 0) +
    ((commWdQueue ?? []).filter(sameAgent).length ?? 0);
  const tabBadges: Partial<Record<DetailTab, number>> = {
    ...(bookingsFeed && bookingsFeed.total > 0 ? { bookings: bookingsFeed.total } : {}),
    ...(financialPending > 0 ? { financial: financialPending } : {}),
    ...(agentMarkups && agentMarkups.length > 0 ? { pricing: agentMarkups.length } : {}),
  };

  return (
    <ModalErrorBoundary>
    <div className="space-y-6">
      {/* Back + Breadcrumb */}
      <div>
        <button onClick={() => router.back()} className="mb-3 inline-flex min-h-[44px] cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeftIcon className="size-5" /> Back to Agents
        </button>
        <PageBreadcrumb pageTitle={[agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email} />
      </div>

      {/* ── Hero header: identity + money at a glance ───────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-teal-500/10 text-xl font-semibold text-brand-teal-600 ring-1 ring-black/5 dark:text-brand-teal-400 dark:ring-white/10">
              {(agent.firstName?.[0] ?? agent.email[0]).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">
                  {[agent.firstName, agent.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                </h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.bg}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
                  {statusConfig.label}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  profile?.isSuspended
                    ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${profile?.isSuspended ? 'bg-error-500' : 'bg-success-500'}`} />
                  {profile?.isSuspended ? 'Suspended' : 'Active'}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {agent.email}
                {profile?.companyName ? <> · {profile.companyName}</> : null}
                {agent.roleName ? <> · {agent.roleName.replace(/_/g, ' ')}</> : null}
              </p>
            </div>
          </div>

          {canApprove && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-success-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-success-600 disabled:opacity-50"
              >
                <CheckCircleIcon className="size-4" />
                {approveMutation.isPending ? 'Approving…' : 'Approve'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-error-300/60 bg-card px-4 py-2 text-sm font-medium text-error-600 transition-colors hover:bg-error-500/10 dark:text-error-400"
              >
                <CloseLineIcon className="size-4" />
                Reject
              </button>
            </div>
          )}
        </div>

        {/* Key financial strip — the 4 numbers admins check first */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Wallet balance
              <InfoTip>Money the agent has prepaid into their wallet. Bookings spend this first.</InfoTip>
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{wmt(profile?.walletBalance)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Credit available
              <InfoTip>How much of the credit line the agent can still spend: limit minus what is currently used by unsettled bookings.</InfoTip>
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {wmt(creditAvailable)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">of {wmt(creditLimit)}</span>
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Commission rate
              <InfoTip>What the platform pays the agent back per confirmed booking. Per-rule tiers may override this fallback.</InfoTip>
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-brand-teal-600 dark:text-brand-teal-400">{profile?.commissionRate ?? 0}%</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Credit utilization
              <InfoTip>Share of the credit line currently used. Above 80% is flagged red; agents auto-suspend at {profile?.autoSuspendThreshold ?? 100}%.</InfoTip>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[100px] overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all ${utilizationTone}`} style={{ width: `${Math.min(utilization, 100)}%` }} />
              </div>
              <span className={`text-xs font-semibold ${utilization >= 80 ? 'text-error-600 dark:text-error-400' : 'text-muted-foreground'}`}>{utilization}%</span>
            </div>
          </div>
        </div>

        {isRejected && profile?.suspensionReason && (
          <div className="mt-4 rounded-lg bg-error-50 p-3 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">
            <p className="font-medium">Rejection reason:</p>
            <p>{profile.suspensionReason}</p>
          </div>
        )}
      </div>

      {/* ── Section tabs ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-xs">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            title={tab.hint}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-brand-teal-500 text-white shadow-sm'
                : 'border border-input bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {tab.label}
            {tabBadges[tab.key] != null && (
              <span className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                activeTab === tab.key
                  ? 'bg-white/95 text-brand-teal-700'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {tabBadges[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bookings trend (client aggregate of the bookings feed) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Bookings trend</h3>
              <button
                onClick={() => setActiveTab('bookings')}
                className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-brand-teal-500 hover:underline"
              >
                View bookings
              </button>
            </div>
            {bookingTrend.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground italic">No bookings in the recent feed yet — new bookings will chart here.</p>
            ) : (
              <ChartContainer config={bookingTrendConfig} className="mt-3 h-[220px] w-full">
                <BarChart accessibilityLayer data={bookingTrend} margin={{ top: 16, right: 12, left: 12, bottom: 0 }} barCategoryGap="24%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={14} interval="preserveStartEnd" />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Legend content={<ChartLegendContent />} />
                  <Bar dataKey="flights" stackId="a" fill="var(--color-flights)" radius={[0, 0, 4, 4]} maxBarSize={28} isAnimationActive={false} />
                  <Bar dataKey="hotels" stackId="a" fill="var(--color-hotels)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            )}
          </div>
          {/* Contact & account */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <h3 className="text-base font-semibold text-foreground">Account</h3>
            <div className="mt-4 space-y-3">
              {[
                ['Member since', new Date(agent.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })],
                ['Last login', agent.lastLoginAt ? new Date(agent.lastLoginAt).toLocaleDateString() : '—'],
                ['Phone', agent.phone || '—'],
                ['Account type', 'Agent'],
                ['Role', agent.roleName ? agent.roleName.replace(/_/g, ' ') : 'None assigned'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Company (editable) + KYC (read-only) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                Company & KYC
                <InfoTip>KYC (Know Your Customer): the registration documents the agent submitted. Agents can book while documents are pending review, unless an admin rejects them.</InfoTip>
              </h3>
              {hasPermission(PermissionCode.AGENTS_WRITE) && (
                editingCompany ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setEditingCompany(false)}
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => profileMutation.mutate({
                        companyName: companyForm.companyName.trim(),
                        companyPhone: companyForm.companyPhone.trim(),
                        companyAddress: companyForm.companyAddress.trim(),
                        taxId: companyForm.taxId.trim(),
                      })}
                      disabled={profileMutation.isPending}
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                    >
                      {profileMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openCompanyEditor(extProfile)}
                    className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <PencilIcon className="size-3.5" />
                    Edit
                  </button>
                )
              )}
            </div>
            {editingCompany ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([
                  ['companyName', 'Company name'],
                  ['companyPhone', 'Company phone'],
                  ['taxId', 'Tax ID / VAT'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                    <input
                      type="text"
                      value={companyForm[key]}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Company address</label>
                  <input
                    type="text"
                    value={companyForm.companyAddress}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, companyAddress: e.target.value }))}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Company Name</p>
                <p className="text-sm font-medium text-foreground">{profile?.companyName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tax ID / VAT</p>
                <p className="text-sm font-medium text-foreground">{profile?.taxId || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Company Phone</p>
                <p className="text-sm font-medium text-foreground">{profile?.companyPhone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">KYC Status</p>
                <p className="text-sm font-medium">
                  {profile?.kycStatus === 'APPROVED' ? (
                    <span className="inline-flex items-center gap-1.5 text-success-600 dark:text-success-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-500" /> Documents approved
                    </span>
                  ) : profile?.kycStatus === 'REJECTED' ? (
                    <span className="inline-flex items-center gap-1.5 text-error-600 dark:text-error-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-error-500" /> Rejected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-warning-600 dark:text-warning-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning-500" /> Pending review
                    </span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Company Address</p>
                <p className="text-sm font-medium text-foreground">{profile?.companyAddress || '—'}</p>
              </div>
              </div>
            )}
          </div>

          {/* Status flags */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-2">
            <h3 className="text-base font-semibold text-foreground">Status controls</h3>
            <div className="mt-4 flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${profile?.isSuspended ? 'bg-error-500' : 'bg-success-500'}`} />
                <span className="text-sm text-muted-foreground">{profile?.isSuspended ? 'Suspended — cannot book' : 'Active — can book'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${profile?.isApproved ? 'bg-success-500' : 'bg-warning-500'}`} />
                <span className="text-sm text-muted-foreground">{profile?.isApproved ? 'Approved' : 'Not approved'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                <span className="text-sm text-muted-foreground">Auto-suspends at {profile?.autoSuspendThreshold ?? 100}% credit utilization</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Suspension and approval changes are managed from the{' '}
              <Link href="/admin/agents" className="text-brand-teal-500 hover:underline">Agents listing</Link> (Edit settings).
            </p>
          </div>
        </div>
      )}

      {/* ══ FINANCIAL ═════════════════════════════════════════ */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          {/* Money-model explainer */}
          <div className="rounded-2xl border border-brand-teal-200 bg-brand-teal-50/60 p-4 dark:border-brand-teal-900/40 dark:bg-brand-teal-950/20">
            <div className="text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">How this agent&apos;s money works</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Customers pay supplier price + markup (the agency&apos;s margin). Each booking is charged to the <strong>wallet</strong> first,
                  then to the <strong>credit line</strong>. <strong>Commission</strong> is what the platform pays back per confirmed booking —
                  paid from Commissions. Use <em>Adjust balance</em> to top up the wallet or correct it; use <em>Set credit limit</em> to change how much they can borrow.
                </p>
              </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Live balances */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Balances</h3>
                <div className="flex items-center gap-2">
                  {hasPermission(PermissionCode.AGENTS_SET_CREDIT) && (
                    <button
                      onClick={() => { setCreditLimitInput(String(wallet?.wallet?.creditLimit ?? profile?.creditLimit ?? '')); setShowCreditLimitModal(true); }}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <PencilIcon className="size-3.5" />
                      Set Credit Limit
                    </button>
                  )}
                  {hasPermission(PermissionCode.AGENTS_WRITE) && (
                    <button
                      onClick={() => { setAdjustAmount(''); setAdjustReason(''); setShowAdjustModal(true); }}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600"
                    >
                      + Adjust Balance
                    </button>
                  )}
                </div>
              </div>

              {!wallet ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-brand-teal-500" />
                </div>
              ) : wallet.wallet ? (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className={`rounded-xl p-4 ${wallet.wallet.walletBalance > 0 ? 'bg-brand-teal-50 dark:bg-brand-teal-900/20' : 'bg-muted/40'}`}>
                      <p className="text-xs text-muted-foreground">Wallet balance</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{wmt(wallet.wallet.walletBalance)}</p>
                      <p className="text-xs text-muted-foreground">Prepaid — spent first</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-4">
                      <p className="text-xs text-muted-foreground">Credit line</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{wmt(wallet.wallet.creditAvailable)}</p>
                      <p className="text-xs text-muted-foreground">available of {wmt(wallet.wallet.creditLimit)} · {wmt(wallet.wallet.creditUsed)} used</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-4">
                      <p className="text-xs text-muted-foreground">Utilization</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-all ${utilizationTone}`} style={{ width: `${Math.min(wallet.wallet.utilizationPercent, 100)}%` }} />
                        </div>
                        <span className={`text-sm font-bold ${wallet.wallet.utilizationPercent >= 80 ? 'text-error-600 dark:text-error-400' : 'text-muted-foreground'}`}>
                          {wallet.wallet.utilizationPercent}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Auto-suspend at {profile?.autoSuspendThreshold ?? 100}%</p>
                    </div>
                  </div>

                  {/* Markup fallbacks + commission */}
                  <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Commission rate</p>
                      <p className="text-sm font-semibold text-foreground">{profile?.commissionRate ?? 0}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Flight markup fallback</p>
                      <p className="text-sm font-semibold text-foreground">{(profile?.flightMarkup ?? 0).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hotel markup fallback</p>
                      <p className="text-sm font-semibold text-foreground">{(profile?.hotelMarkup ?? 0).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pricing mode</p>
                      <p className="text-sm font-semibold text-foreground">{(profile as any)?.pricingMode === 'raw' ? 'Raw supplier price' : 'With admin markup'}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Fallbacks apply only when no markup rule matches — manage rules in the Pricing tab.</p>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground italic">No wallet record yet — it is created on first top-up.</p>
              )}
            </div>

            {/* Markup & credit settings (editable fallbacks) */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                  Markup & credit
                  <InfoTip>Fallbacks apply only when no markup rule matches — manage rules in the Pricing tab.</InfoTip>
                </h3>
                {hasPermission(PermissionCode.AGENTS_WRITE) && (
                  editingPricingDefaults ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => setEditingPricingDefaults(false)}
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const toNum = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.min(100, parseFloat(s))));
                          const cr = toNum(pricingDefaultsForm.commissionRate);
                          const fm = toNum(pricingDefaultsForm.flightMarkup);
                          const hm = toNum(pricingDefaultsForm.hotelMarkup);
                          if (cr === undefined && fm === undefined && hm === undefined) return;
                          if ([cr, fm, hm].some((v) => v !== undefined && (isNaN(v) || v < 0))) return;
                          profileMutation.mutate({
                            ...(cr !== undefined && !isNaN(cr) ? { commissionRate: cr } : {}),
                            ...(fm !== undefined && !isNaN(fm) ? { flightMarkup: fm } : {}),
                            ...(hm !== undefined && !isNaN(hm) ? { hotelMarkup: hm } : {}),
                          });
                        }}
                        disabled={profileMutation.isPending}
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                      >
                        {profileMutation.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openPricingDefaultsEditor(extProfile)}
                      className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <PencilIcon className="size-3.5" />
                      Edit
                    </button>
                  )
                )}
              </div>
              {editingPricingDefaults ? (
                <div className="mt-4 space-y-3">
                  {([
                    ['commissionRate', 'Commission rate (%)', 'What the platform pays back per confirmed booking.'],
                    ['flightMarkup', 'Flight markup fallback (%)', 'Applies when no flight markup rule matches.'],
                    ['hotelMarkup', 'Hotel markup fallback (%)', 'Applies when no hotel markup rule matches.'],
                  ] as const).map(([key, label, hint]) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={pricingDefaultsForm[key]}
                        onChange={(e) => setPricingDefaultsForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                      />
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => { setCreditLimitInput(String(wallet?.wallet?.creditLimit ?? profile?.creditLimit ?? '')); setShowCreditLimitModal(true); }}
                    className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-brand-teal-500 hover:underline"
                  >
                    Set credit limit instead (opens dialog)
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-3xl font-bold text-brand-teal-600 dark:text-brand-teal-400">{profile?.commissionRate ?? 0}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">Commission — earned per confirmed booking, paid out from Admin → Commissions.</p>
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Flight markup fallback</span>
                      <span className="text-xs font-semibold text-foreground">{(profile?.flightMarkup ?? 0).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Hotel markup fallback</span>
                      <span className="text-xs font-semibold text-foreground">{(profile?.hotelMarkup ?? 0).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Credit limit</span>
                      <span className="text-xs font-semibold text-foreground">{wmt(profile?.creditLimit)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Top-up approval queue (this agent's pending requests) */}
          {topupQueue && topupQueue.filter((r: any) => r.agentProfileId === walletTxns?.agentProfileId || r.agentEmail).length >= 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Top-up requests</h3>
                <span className="text-xs text-muted-foreground">{topupQueue.filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).length} pending</span>
              </div>
              {topupQueue.filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground italic">No pending requests for this agent.</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {topupQueue.filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-muted/60">
                      <div className="min-w-0">
                        <span className="font-mono font-medium text-foreground">+{formatCurrencyWithCode(r.amount, r.currency ?? wCur, decimalsMap)}</span>
                        <span className="ml-2 truncate text-muted-foreground">{r.description ?? 'Top-up request'}{r.reference ? ` · ${r.reference}` : ''} · {new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      {hasPermission(PermissionCode.AGENTS_APPROVE) && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => approveTopupMutation.mutate(r.id)}
                            disabled={approveTopupMutation.isPending}
                            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectTopupMutation.mutate(r.id)}
                            disabled={rejectTopupMutation.isPending}
                            className="cursor-pointer rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Wallet withdrawal queue (this agent) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Wallet withdrawals</h3>
              <span className="text-xs text-muted-foreground">{(walletWdQueue ?? []).filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).length} pending</span>
            </div>
            {(walletWdQueue ?? []).filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground italic">No pending wallet withdrawals for this agent.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {(walletWdQueue ?? []).filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).map((r: any) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-muted/60">
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-foreground">−{formatCurrencyWithCode(Math.abs(r.amount), r.currency ?? wCur, decimalsMap)}</span>
                      <span className="ml-2 truncate text-muted-foreground" title={r.description ?? r.reference ?? undefined}>{r.reference ?? 'Withdrawal'}{r.description ? ` · ${r.description}` : ''} · {new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {hasPermission(PermissionCode.AGENTS_APPROVE) && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <input
                          value={payRef[r.id] ?? ''}
                          onChange={(e) => setPayRef((p) => ({ ...p, [r.id]: e.target.value }))}
                          placeholder="Payment ref (optional)"
                          className="w-40 min-h-[44px] rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                        />
                        <button
                          onClick={() => approveWalletWdMutation.mutate({ requestId: r.id, ref: payRef[r.id]?.trim() || undefined })}
                          disabled={approveWalletWdMutation.isPending}
                          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectWalletWdMutation.mutate(r.id)}
                          disabled={rejectWalletWdMutation.isPending}
                          className="cursor-pointer rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commission withdrawal queue (this agent) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Commission withdrawals</h3>
              <span className="text-xs text-muted-foreground">{(commWdQueue ?? []).filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).length} pending</span>
            </div>
            {(commWdQueue ?? []).filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground italic">No pending commission withdrawals for this agent.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {(commWdQueue ?? []).filter((r: any) => !walletTxns?.agentProfileId || r.agentProfileId === walletTxns.agentProfileId).map((r: any) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-muted/60">
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-foreground">
                        {r.amount != null ? formatCurrencyWithCode(r.amount, r.currency ?? wCur, decimalsMap) : 'Current pending'}
                      </span>
                      <span className="ml-2 truncate text-muted-foreground" title={r.description ?? r.reference ?? undefined}>{r.reference ?? 'Withdrawal'}{r.description ? ` · ${r.description}` : ''} · {new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {hasPermission(PermissionCode.AGENTS_APPROVE) && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <input
                          value={payRef[r.id] ?? ''}
                          onChange={(e) => setPayRef((p) => ({ ...p, [r.id]: e.target.value }))}
                          placeholder="Payment ref (optional)"
                          className="w-40 min-h-[44px] rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                        />
                        <button
                          onClick={() => approveCommWdMutation.mutate({ requestId: r.id, ref: payRef[r.id]?.trim() || undefined })}
                          disabled={approveCommWdMutation.isPending}
                          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectCommWdMutation.mutate(r.id)}
                          disabled={rejectCommWdMutation.isPending}
                          className="cursor-pointer rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transaction history */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Transaction history</h3>
              {walletTxns?.transactions && (
                <span className="text-xs text-muted-foreground">{walletTxns.transactions.total} transactions</span>
              )}
            </div>

            {!walletTxns ? (
              <div className="mt-3 h-20 animate-pulse rounded-lg bg-muted" />
            ) : walletTxns.transactions && walletTxns.transactions.items.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {walletTxns.transactions.items.map((txn: any) => (
                  <div key={txn.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-muted/60">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        txn.type === 'deposit' ? 'bg-success-500' : txn.type === 'deduct' ? 'bg-error-500' : 'bg-warning-500'
                      }`} />
                      <span className="shrink-0 font-medium capitalize text-muted-foreground">
                        {txn.type.replace(/_/g, ' ')}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {txn.description || '—'}
                      </span>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-3">
                      <span className="text-muted-foreground">{new Date(txn.createdAt).toLocaleDateString()}</span>
                      <span className={`font-mono font-medium ${
                        txn.amount >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'
                      }`}>
                        {txn.amount >= 0 ? '+' : '−'}{formatCurrencyWithCode(Math.abs(txn.amount), txn.currency ?? wCur, decimalsMap)}
                      </span>
                    </div>
                  </div>
                ))}

                {walletTxns.transactions.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setWalletTxnPage((p) => Math.max(1, p - 1))}
                      disabled={walletTxnPage <= 1}
                      className="cursor-pointer text-xs font-medium text-brand-teal-500 hover:text-brand-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Previous
                    </button>
                    <span className="text-xs text-muted-foreground">Page {walletTxnPage} of {walletTxns.transactions.totalPages}</span>
                    <button
                      onClick={() => setWalletTxnPage((p) => Math.min(walletTxns.transactions!.totalPages, p + 1))}
                      disabled={walletTxnPage >= (walletTxns.transactions?.totalPages ?? 1)}
                      className="cursor-pointer text-xs font-medium text-brand-teal-500 hover:text-brand-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground italic">No transactions yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ══ BOOKINGS & INVOICES ═══════════════════════════════ */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Bookings & Invoices</h3>
            <Link href="/admin/agent-bookings" className="inline-flex min-h-[44px] items-center text-xs font-medium text-brand-teal-500 hover:underline">
              Open full bookings feed →
            </Link>
          </div>

          {bookingsPending ? (
            <div className="mt-4 h-32 animate-pulse rounded-lg bg-muted" />
          ) : bookingsFeed && bookingsFeed.items.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {bookingsFeed.items.map((b: AgentBookingFeedItem) => {
                const inv = invoiceByBooking.get(b.id);
                const rowTitle = `${b.type} booking${b.ref ? ` · Ref ${b.ref}` : ''} · ${new Date(b.createdAt).toLocaleString()}${b.passengerName ? ` · ${b.passengerName}` : ''}`;
                return (
                <div key={b.id} title={rowTitle} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60">
                  <div className="flex min-w-0 items-center gap-3">
                    <span title={b.type === 'flight' ? 'Flight booking' : 'Hotel booking'} className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      b.type === 'flight'
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                    }`}>
                      {b.type === 'flight' ? 'Flight' : 'Hotel'}
                    </span>
                    <span className="min-w-0" title={rowTitle}>
                      <span className="block truncate font-medium text-foreground">
                        {b.type === 'flight' ? [b.from, b.to].filter(Boolean).join(' → ') : (b.passengerName || 'Hotel stay')}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {b.ref ? <>Ref {b.ref} · </> : null}{new Date(b.createdAt).toLocaleDateString()}
                        {b.passengerName && b.type === 'flight' ? <> · {b.passengerName}</> : null}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span title={`Booking status: ${b.status}`} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      b.status === 'booked' || b.status === 'confirmed'
                        ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400'
                        : b.status === 'cancelled'
                        ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
                        : 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-400'
                    }`}>
                      {b.status}
                    </span>
                    {inv && (
                      <a
                        href={getAdminInvoicePdfUrl(inv.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Download invoice ${inv.fileName}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-teal-300 hover:text-brand-teal-600 dark:hover:border-brand-teal-600 dark:hover:text-brand-teal-400"
                      >
                        Invoice PDF
                      </a>
                    )}
                    <span title={b.amount != null ? `Total: ${formatCurrencyWithCode(b.amount, b.currency ?? wCur, decimalsMap)}` : 'Amount not available'} className="font-mono text-sm font-semibold text-foreground">
                      {b.amount != null ? formatCurrencyWithCode(b.amount, b.currency ?? wCur, decimalsMap) : '—'}
                    </span>
                  </div>
                </div>
                );
              })}
              {bookingsFeed.total > bookingsFeed.items.length && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Showing latest {bookingsFeed.items.length} of {bookingsFeed.total} bookings —{' '}
                  <Link href="/admin/agent-bookings" className="text-brand-teal-500 hover:underline">see all</Link>
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border bg-card py-10">
              <p className="text-sm font-medium text-muted-foreground">No bookings yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Bookings this agent makes will appear here with amount and status.</p>
            </div>
          )}
        </div>

        {/* Invoice documents (moved from the old Invoices & Access tab) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Invoice documents</h3>
            {invoices && invoices.items.length > 0 && (
              <span className="text-xs text-muted-foreground">{invoices.items.length} documents</span>
            )}
          </div>

          {!invoices ? (
            <div className="mt-4 h-20 animate-pulse rounded-lg bg-muted" />
          ) : invoices.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground italic">No invoices generated yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {invoices.items.map((inv) => (
                <div
                  key={inv.id}
                  title={`${inv.fileName} · ${inv.bookingType} booking · ${new Date(inv.createdAt).toLocaleString()} · Status: ${inv.status}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <svg className="size-5 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={inv.fileName}>{inv.fileName}</p>
                      <p className="truncate text-xs text-muted-foreground capitalize">{inv.bookingType} booking · {new Date(inv.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400">
                      {inv.status}
                    </span>
                    <a
                      href={getAdminInvoicePdfUrl(inv.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Download ${inv.fileName} as PDF`}
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-teal-300 hover:text-brand-teal-600 dark:hover:border-brand-teal-600 dark:hover:text-brand-teal-400"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      )}

      {/* ══ PRICING / MARKUPS ═════════════════════════════════ */}
      {activeTab === 'pricing' && (
        <div className="space-y-6">
          {/* Pricing Mode (read-only — setting is platform-managed) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">Pricing mode
              <InfoTip>
                What the agent pays: supplier price plus your markup rules. Every agent is billed the marked-up price — the markup is the agency&apos;s earning, not an extra fee they owe you.
              </InfoTip>
            </h3>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal-500/10 px-3 py-1 text-xs font-medium text-brand-teal-700 dark:text-brand-teal-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-teal-500" />
                {(profile as any)?.pricingMode === 'raw' ? 'Raw Supplier Price' : 'With Admin Markup'}
              </span>
              <span className="text-xs text-muted-foreground">Platform-managed — all agents are billed the marked-up price.</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">Markup rules
                <InfoTip>
                  Markup = what the agent&apos;s customers pay on top of supplier price — the agency&apos;s margin. Rules apply in priority order; the profile fallbacks (Flight/Hotel Markup) apply when no rule matches.
                </InfoTip>
              </h3>
              {hasPermission(PermissionCode.AGENTS_WRITE) && (
                <button
                  onClick={() => {
                    setActiveTab('pricing');
                    if (!markupEditor.length) initMarkupEditor();
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-teal-500 transition-colors hover:text-brand-teal-600"
                >
                  <PencilIcon className="size-4" />
                  {markupEditor.length ? 'Editor open' : 'Edit Markups'}
                </button>
              )}
            </div>

            {/* Summary of current state */}
            {markupEditor.length === 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Flight markup fallback</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{(profile?.flightMarkup ?? 0).toFixed(2)}%</p>
                  {agentMarkups?.filter((m) => m.applyTo === 'flights').length ? (
                    <span className="text-xs text-muted-foreground">{agentMarkups.filter((m) => m.applyTo === 'flights').length} rule(s) override this</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No specific rules</span>
                  )}
                </div>
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Hotel markup fallback</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{(profile?.hotelMarkup ?? 0).toFixed(2)}%</p>
                  {agentMarkups?.filter((m) => m.applyTo === 'hotels').length ? (
                    <span className="text-xs text-muted-foreground">{agentMarkups.filter((m) => m.applyTo === 'hotels').length} rule(s) override this</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No specific rules</span>
                  )}
                </div>
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Active rules</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{agentMarkups?.length ?? 0}</p>
                  <span className="text-xs text-muted-foreground">Applied in priority order</span>
                </div>
              </div>
            )}

            {markupEditor.length > 0 && (
              <div className="mt-4 space-y-4">
                {markupEditor.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-muted/40 p-4">
                    <div className="flex min-w-[140px] flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Name</label>
                      <input type="text" value={row.name} onChange={(e) => {
                        const next = [...markupEditor];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setMarkupEditor(next);
                      }} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Applies To</label>
                      <select value={row.applyTo} onChange={(e) => {
                        const next = [...markupEditor];
                        next[idx] = { ...next[idx], applyTo: e.target.value };
                        setMarkupEditor(next);
                      }} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20">
                        <option value="flights">Flights</option>
                        <option value="hotels">Hotels</option>
                        <option value="packages">Packages</option>
                        <option value="all">All</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <select value={row.markupType} onChange={(e) => {
                        const next = [...markupEditor];
                        next[idx] = { ...next[idx], markupType: e.target.value };
                        setMarkupEditor(next);
                      }} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20">
                        <option value="fixed">Fixed (amount)</option>
                        <option value="percentage">Percent (%)</option>
                      </select>
                    </div>
                    <div className="flex w-24 flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Value</label>
                      <input type="number" step="0.01" min="0" value={row.markupValue} onChange={(e) => {
                        const next = [...markupEditor];
                        next[idx] = { ...next[idx], markupValue: e.target.value };
                        setMarkupEditor(next);
                      }} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Route From</label>
                      <input type="text" value={row.routeFrom} onChange={(e) => {
                        const next = [...markupEditor];
                        next[idx] = { ...next[idx], routeFrom: e.target.value };
                        setMarkupEditor(next);
                      }} placeholder="e.g. JFK" className="w-20 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Route To</label>
                      <input type="text" value={row.routeTo} onChange={(e) => {
                        const next = [...markupEditor];
                        next[idx] = { ...next[idx], routeTo: e.target.value };
                        setMarkupEditor(next);
                      }} placeholder="e.g. LHR" className="w-20 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20" />
                    </div>
                    <button onClick={() => {
                      setMarkupEditor(markupEditor.filter((_, i) => i !== idx));
                    }} aria-label={`Remove markup row ${idx + 1}`} className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center self-end rounded-lg text-muted-foreground transition-colors hover:bg-error-500/10 hover:text-error-600 dark:hover:text-error-400">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="6" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => setMarkupEditor([...markupEditor, { name: '', applyTo: 'flights', markupType: 'fixed', markupValue: '', routeFrom: '', routeTo: '' }])}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-teal-300 hover:text-brand-teal-600 dark:hover:border-brand-teal-600 dark:hover:text-brand-teal-400">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Row
                  </button>
                  <button onClick={async () => {
                    // Load templates for agent markup import (typed client:
                    // auth + refresh + retry instead of manual token fetch).
                    let templates;
                    try {
                      templates = await getMarkupTemplates();
                    } catch {
                      pushToast({ title: 'Failed to load templates.', type: 'error' });
                      return;
                    }
                    if (templates.length === 0) { pushToast({ title: 'No templates available. Create one in Settings > Markups.', type: 'warning' }); return; }
                    const name = await promptDialog({
                      title: 'Template name to apply',
                      message: templates.map((t, i) => `${i + 1}. ${t.name} (${t.rules.length} rules)`).join('\n'),
                      placeholder: 'Template name',
                      confirmLabel: 'Apply',
                    });
                    if (!name) return;
                    const template = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
                    if (!template) { pushToast({ title: 'Template not found.', type: 'error' }); return; }
                    const newRules: typeof markupEditor = (template.rules || []).map((r) => ({
                      name: r.name || template.name,
                      applyTo: r.applyTo || 'all',
                      markupType: r.markupType || 'fixed',
                      markupValue: String(r.markupValue ?? 0),
                      routeFrom: r.routeFrom || '',
                      routeTo: r.routeTo || '',
                    }));
                    setMarkupEditor([...markupEditor, ...newRules]);
                  }}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-brand-teal-300 px-4 py-2 text-sm font-medium text-brand-teal-600 transition-colors hover:border-brand-teal-500 hover:bg-brand-teal-500/10 dark:border-brand-teal-600 dark:text-brand-teal-400 dark:hover:border-brand-teal-500">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    Import Template
                  </button>
                  <button onClick={() => {
                    const payload = markupEditor
                      .filter((r) => r.name.trim() && r.markupValue)
                      .map((r) => ({
                        name: r.name.trim(),
                        applyTo: r.applyTo,
                        markupType: r.markupType,
                        markupValue: parseFloat(r.markupValue),
                        routeFrom: r.routeFrom || undefined,
                        routeTo: r.routeTo || undefined,
                      }));
                    if (payload.length > 0) markupsMutation.mutate(payload);
                  }} disabled={markupsMutation.isPending}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                    {markupsMutation.isPending ? 'Saving…' : 'Save Markups'}
                  </button>
                </div>

                {agentMarkups && agentMarkups.length > 0 && (
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Currently active rules</p>
                    <div className="mt-2 space-y-1">
                      {agentMarkups.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-500" />
                          <span className="font-mono">{rule.name}</span>
                          <span className="text-muted-foreground">({rule.applyTo}, {rule.markupType === 'percentage' ? `${rule.markupValue}%` : `${rule.markupValue} ${rule.currency ?? '(no currency)'}`}{rule.routeFrom ? `, ${rule.routeFrom}→${rule.routeTo}` : ''})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ ACCESS ════════════════════════════════════════════ */}
      {activeTab === 'access' && (
        <div className="grid gap-6">
          {/* Supplier & gateway allowlists (null/empty = all allowed) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                Supplier & gateway allowlists
                <InfoTip>Restrict which suppliers and payment gateways this agent may use. Empty (or cleared) means everything is allowed.</InfoTip>
              </h3>
              {hasPermission(PermissionCode.AGENTS_WRITE) && (
                <button
                  onClick={() => profileMutation.mutate({
                    allowedFlightProviders: flightProviders,
                    allowedHotelProviders: hotelProviders,
                    allowedGateways: gateways,
                  } as AgentProfileUpdate)}
                  disabled={profileMutation.isPending || !allowlistDirty}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                >
                  {profileMutation.isPending ? 'Saving…' : 'Save allowlists'}
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => { setFlightProviders(null); setHotelProviders(null); setAllowlistDirty(true); }}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Allow all suppliers
              </button>
              <button
                onClick={() => { setGateways(null); setAllowlistDirty(true); }}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Allow all gateways
              </button>
              <button
                onClick={() => { setGateways([...GATEWAY_OPTIONS]); setAllowlistDirty(true); }}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Disable all gateways
              </button>
            </div>
            <div className="mt-4 grid gap-6 md:grid-cols-3">
              <AllowlistGroup
                label="Flight suppliers"
                hint="Which flight providers this agent can book through."
                options={FLIGHT_PROVIDER_OPTIONS}
                value={flightProviders}
                onToggle={(opt) => {
                  setFlightProviders((v) => {
                    if (v === null) return [opt];
                    const next = v.includes(opt) ? v.filter((x) => x !== opt) : [...v, opt];
                    return next.length ? next : null;
                  });
                  setAllowlistDirty(true);
                }}
                onClear={() => { setFlightProviders(null); setAllowlistDirty(true); }}
              />
              <AllowlistGroup
                label="Hotel suppliers"
                hint="Which hotel providers this agent can book through."
                options={HOTEL_PROVIDER_OPTIONS}
                value={hotelProviders}
                onToggle={(opt) => {
                  setHotelProviders((v) => {
                    if (v === null) return [opt];
                    const next = v.includes(opt) ? v.filter((x) => x !== opt) : [...v, opt];
                    return next.length ? next : null;
                  });
                  setAllowlistDirty(true);
                }}
                onClear={() => { setHotelProviders(null); setAllowlistDirty(true); }}
              />
              <AllowlistGroup
                label="Payment gateways"
                hint="Which gateways this agent may pay through."
                options={GATEWAY_OPTIONS}
                value={gateways}
                onToggle={(opt) => {
                  setGateways((v) => {
                    if (v === null) return [opt];
                    const next = v.includes(opt) ? v.filter((x) => x !== opt) : [...v, opt];
                    return next.length ? next : null;
                  });
                  setAllowlistDirty(true);
                }}
                onClear={() => { setGateways(null); setAllowlistDirty(true); }}
              />
            </div>
          </div>

          {/* Role & Permissions */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <h3 className="text-base font-semibold text-foreground">Role & permissions</h3>
            <div className="mt-4 space-y-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Assigned role</label>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedRoleId || agent.roleId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setSelectedRoleId(val);
                        roleMutation.mutate(val);
                      }
                    }}
                    className="w-full max-w-xs rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">Select role…</option>
                    {agentRoleOptions.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  {roleMutation.isPending && (
                    <span className="text-sm text-muted-foreground">Saving…</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Current: <strong>{agent.roleName || 'None'}</strong>
                </p>
              </div>

              <div className="rounded-xl bg-muted/40 p-4">
                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 size-5 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Permissions managed via role</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      This agent&apos;s permissions are determined by their assigned role.
                      To customize permissions, go to{' '}
                       <Link href="/admin/roles" className="text-brand-teal-500 hover:text-brand-teal-600 underline">Roles & Permissions</Link>
                      {' '}→ click edit on the role → toggle the desired permissions.
                    </p>
                  </div>
                </div>
              </div>

              {/* Effective permissions — what the agent can actually do right now */}
              <div className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    What this agent can do
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      from role {effective?.roleName ? effective.roleName.replace(/_/g, ' ') : '—'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tune individual permissions in Overrides below — the role itself stays untouched.
                  </p>
                </div>

                {effectiveError ? (
                  <p className="mt-3 text-xs text-muted-foreground">Unable to load effective permissions (requires user role management permission).</p>
                ) : !effective ? (
                  <div className="mt-3 h-16 animate-pulse rounded-lg bg-muted" />
                ) : effective.effectivePermissions.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground italic">No effective permissions — this agent cannot do anything. Assign a role above.</p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {effective.effectivePermissions.map((code) => {
                        const viaOverride = overrideGranted.includes(code);
                        const chipTitle = viaOverride ? code + ' (granted via override)' : code;
                        const chipClass = viaOverride
                          ? 'inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400'
                          : 'inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground';
                        return (
                          <span key={code} title={chipTitle} className={chipClass}>
                            {permissionLabel(code)}
                            {viaOverride && <span className="text-[10px] font-bold">+override</span>}
                          </span>
                        );
                      })}
                    </div>
                    {hasOverrides && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Role grants {effective.rolePermissions.length} permissions · overrides add {overrideGranted.length}, remove {overrideRevoked.length}.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Permission overrides — agent:* only, tri-state per row */}
          {hasPermission(PermissionCode.USERS_MANAGE_ROLES) ? (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Permission overrides</h3>
                {hasOverrides && (
                  <button
                    onClick={() => overridesMutation.mutate(null)}
                    disabled={overridesMutation.isPending}
                    className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                  >
                    Clear overrides
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Grant or revoke individual agent permissions for this agent only — the role itself is untouched.</p>
              <input
                type="search"
                value={overrideSearch}
                onChange={(e) => setOverrideSearch(e.target.value)}
                placeholder="Search permissions by name or code…"
                aria-label="Search permissions"
                className="mt-3 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              {AGENT_OVERRIDE_GROUPS.map((group) => {
                const q = overrideSearch.trim().toLowerCase();
                const rows = group.codes.filter((code) =>
                  !q || (AGENT_FRIENDLY_NAMES[code] ?? code).toLowerCase().includes(q) || code.includes(q),
                );
                if (rows.length === 0) return null;
                return (
                  <div key={group.header} className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.header}</p>
                    <div className="mt-2 space-y-1.5">
                      {rows.map((code) => {
                        const granted = draftGrant.includes(code);
                        const status = overrideGranted.includes(code)
                          ? 'Granted by override'
                          : overrideRevoked.includes(code)
                            ? 'Revoked by override'
                            : (effective?.rolePermissions.includes(code) ?? false)
                              ? 'From role'
                              : 'Not granted';
                        return (
                          <div key={code} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-1.5 transition-colors hover:bg-muted/60">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{AGENT_FRIENDLY_NAMES[code] ?? code}</p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">{code} · {status}</p>
                            </div>
                            <SettingToggle
                              label={`${AGENT_FRIENDLY_NAMES[code] ?? code} override (on = grant, off = revoke)`}
                              checked={granted}
                              disabled={overridesMutation.isPending}
                              onChange={(next) => {
                                const nextGrant = next ? [...draftGrant.filter((c) => c !== code), code] : draftGrant.filter((c) => c !== code);
                                const nextRevoke = next ? draftRevoke.filter((c) => c !== code) : [...draftRevoke.filter((c) => c !== code), code];
                                setDraftGrant(nextGrant);
                                setDraftRevoke(nextRevoke);
                                overridesMutation.mutate({ grant: nextGrant, revoke: nextRevoke });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {overridesMutation.isPending && (
                <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">Saving…</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Override editing needs role-management permission.</p>
          )}

        </div>
      )}

      {/* ══ SUBAGENTS (full control surface — single Save bar) ═════════ */}
      {activeTab === 'subagents' && (
        <div className="grid gap-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <h3 className="text-base font-semibold text-foreground">Sub-agent management</h3>
            <div className="mt-2 divide-y divide-border/60">
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Allow sub-agents</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Lets this agent create and manage their own sub-agents.</p>
                </div>
                <SettingToggle label="Allow sub-agents" checked={subForm.canManageSubAgents} disabled={!canEditSub} onChange={(v) => setSub({ canManageSubAgents: v })} />
              </div>
              <div className="py-3">
                <label htmlFor="sub-max" className="block text-sm font-medium text-muted-foreground">Max sub-agents</label>
                <p className="mt-0.5 text-xs text-muted-foreground">How many sub-agents this agent may create. Empty keeps the current value.</p>
                <input
                  id="sub-max"
                  type="number"
                  min="0"
                  step="1"
                  value={subForm.maxSubAgents}
                  disabled={!canEditSub}
                  onChange={(e) => setSub({ maxSubAgents: e.target.value })}
                  placeholder={profile?.maxSubAgents != null ? String(profile.maxSubAgents) : 'e.g. 10'}
                  className="mt-2 min-h-[44px] w-full max-w-xs rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                />
              </div>
              <div className="py-3">
                <label htmlFor="sub-credit" className="block text-sm font-medium text-muted-foreground">Max credit per sub-agent ({wCur})</label>
                <p className="mt-0.5 text-xs text-muted-foreground">Credit cap for each sub-agent, in wallet currency. Bookings beyond it are rejected.</p>
                <input
                  id="sub-credit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={subForm.maxCreditPerSub}
                  disabled={!canEditSub}
                  onChange={(e) => setSub({ maxCreditPerSub: e.target.value })}
                  placeholder={profile?.maxCreditPerSub != null ? String(profile.maxCreditPerSub) : 'e.g. 500'}
                  className="mt-2 min-h-[44px] w-full max-w-xs rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <h3 className="text-base font-semibold text-foreground">Roles & inheritance</h3>
            <div className="mt-3">
              <p className="text-sm font-medium text-muted-foreground">Allowed sub-agent roles</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Which roles this agent may assign to sub-agents. Empty means any agent role.</p>
              {!roles ? (
                <div className="mt-2 h-11 animate-pulse rounded-xl bg-muted" />
              ) : agentRoleOptions.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground italic">No agent roles found.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {agentRoleOptions.map((role) => {
                    const selected = subForm.allowedSubAgentRoleIds.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        onClick={() => setSub({
                          allowedSubAgentRoleIds: selected
                            ? subForm.allowedSubAgentRoleIds.filter((x) => x !== role.id)
                            : [...subForm.allowedSubAgentRoleIds, role.id],
                        })}
                        aria-pressed={selected}
                        disabled={!canEditSub}
                        className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? 'bg-brand-teal-500 text-white shadow-sm'
                            : 'border border-input bg-card text-muted-foreground hover:border-brand-teal-300 hover:text-brand-teal-600 dark:hover:border-brand-teal-600 dark:hover:text-brand-teal-400'
                        }`}
                      >
                        {role.name.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="sub-default-role" className="block text-sm font-medium text-muted-foreground">Default sub-agent role</label>
              <p className="mt-0.5 text-xs text-muted-foreground">Role new sub-agents get when none is picked.</p>
              <select
                id="sub-default-role"
                value={subForm.subAgentDefaultRoleId}
                disabled={!canEditSub}
                onChange={(e) => setSub({ subAgentDefaultRoleId: e.target.value })}
                className="mt-2 min-h-[44px] w-full max-w-xs cursor-pointer rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
              >
                <option value="">None</option>
                {agentRoleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 divide-y divide-border/60">
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Inherit markups</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Sub-agents use this agent&apos;s markup rules.</p>
                </div>
                <SettingToggle label="Inherit markups" checked={subForm.inheritMarkups} disabled={!canEditSub} onChange={(v) => setSub({ inheritMarkups: v })} />
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Inherit commission</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Sub-agents use this agent&apos;s commission rate.</p>
                </div>
                <SettingToggle label="Inherit commission" checked={subForm.inheritCommission} disabled={!canEditSub} onChange={(v) => setSub({ inheritCommission: v })} />
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Segregated credit</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Separate: each sub-agent spends their own credit. Shared: sub-agents spend from this agent&apos;s credit line.</p>
                </div>
                <SettingToggle label="Segregated credit" checked={subForm.segregatedCredit} disabled={!canEditSub} onChange={(v) => setSub({ segregatedCredit: v })} />
              </div>
            </div>
          </div>

          {canEditSub && (
            <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
              <p className="text-xs text-muted-foreground">{subDirty ? 'Unsaved sub-agent changes.' : 'No unsaved changes.'}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetSubForm}
                  disabled={!subDirty || profileMutation.isPending}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-input bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    const maxSub = subForm.maxSubAgents.trim() === '' ? undefined : Math.max(0, parseInt(subForm.maxSubAgents, 10) || 0);
                    const maxCredit = subForm.maxCreditPerSub.trim() === '' ? undefined : Math.max(0, parseFloat(subForm.maxCreditPerSub) || 0);
                    profileMutation.mutate({
                      canManageSubAgents: subForm.canManageSubAgents,
                      ...(maxSub !== undefined ? { maxSubAgents: maxSub } : {}),
                      ...(maxCredit !== undefined ? { maxCreditPerSub: maxCredit } : {}),
                      allowedSubAgentRoleIds: subForm.allowedSubAgentRoleIds,
                      inheritMarkups: subForm.inheritMarkups,
                      inheritCommission: subForm.inheritCommission,
                      segregatedCredit: subForm.segregatedCredit,
                      ...(subForm.subAgentDefaultRoleId ? { subAgentDefaultRoleId: subForm.subAgentDefaultRoleId } : {}),
                    });
                  }}
                  disabled={!subDirty || profileMutation.isPending}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-brand-teal-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                >
                  {profileMutation.isPending ? 'Saving…' : 'Save sub-agent settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowRejectModal(false); setRejectReason(''); }}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground">Reject Agent</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Reject <strong>{agent.email}</strong>? Provide a reason.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Missing documents, incomplete info…"
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-error-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-error-600 disabled:opacity-50">
                {rejectMutation.isPending ? 'Rejecting…' : 'Reject Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Limit Modal */}
      {showCreditLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreditLimitModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground">Set Credit Limit</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Current limit: <strong>{wmt(creditLimit)}</strong> · Used: <strong>{wmt(creditUsed)}</strong>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Limits are denominated in the agent&apos;s wallet currency ({wCur}). Raising the limit immediately increases what the agent can spend on credit. Lowering it does not claw back already-used credit.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">New Credit Limit ({wCur})</label>
              <input
                type="number"
                min="0"
                value={creditLimitInput}
                onChange={(e) => setCreditLimitInput(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowCreditLimitModal(false)}
                className="flex-1 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button onClick={() => {
                const limit = parseFloat(creditLimitInput);
                if (limit >= 0 && !isNaN(limit)) creditLimitMutation.mutate(limit);
              }} disabled={creditLimitMutation.isPending || !creditLimitInput || isNaN(parseFloat(creditLimitInput)) || parseFloat(creditLimitInput) < 0}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {creditLimitMutation.isPending ? 'Saving…' : 'Set Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAdjustModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground">Adjust Wallet Balance</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Current balance: <strong>{wmt(profile?.walletBalance)}</strong>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Amounts are in the agent&apos;s wallet currency ({wCur}) unless you pick another. Use positive amounts to credit the wallet (top-up, refund), negative to debit (correction). The agent sees this as a ledger entry.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Amount ({wCur})</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="e.g. 100 or -50"
                    className="w-full rounded-xl border border-input bg-background py-2.5 pl-4 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Reason *</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Commission payment, refund, correction"
                  className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowAdjustModal(false)}
                className="flex-1 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button onClick={() => {
                const amount = parseFloat(adjustAmount);
                if (!isNaN(amount) && amount !== 0 && adjustReason.trim()) {
                  adjustBalanceMutation.mutate({ amount, reason: adjustReason.trim() });
                }
              }} disabled={adjustBalanceMutation.isPending || !adjustAmount || isNaN(parseFloat(adjustAmount)) || parseFloat(adjustAmount) === 0 || !adjustReason.trim()}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">
                {adjustBalanceMutation.isPending ? 'Adjusting…' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ModalErrorBoundary>
  );
}

export default function AdminAgentDetailPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.AGENTS_READ]}>
      <AgentDetailPage />
    </RequirePagePermission>
  );
}
