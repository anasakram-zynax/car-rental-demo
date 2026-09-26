'use client';

import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Search,
  Send,
  Server,
  ShieldAlert,
  X,
} from 'lucide-react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { useToast } from '@/hooks/useToast';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Switch from '@/components/form/switch/Switch';
import { cn } from '@/lib/cn';
import { getEmailRules, updateEmailRule, sendTestEmail, type EmailRule } from '@/features/admin/api/admin-emails';
import {
  getEmailProviderConfig,
  updateEmailProviderConfig,
  testEmailProviderConnection,
} from '@/features/admin/api/admin-email-settings';

type Provider = 'smtp' | 'resend';

const AUDIENCE_FILTERS = ['all', 'customer', 'agent', 'admin', 'critical'] as const;
type AudienceFilter = (typeof AUDIENCE_FILTERS)[number];

/** Pretty label for a raw event key: booking.flight.created → Booking · Flight · Created */
function prettyEventKey(type: string): string {
  return type
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

function RuleAudienceBadges({ rule }: { rule: EmailRule }) {
  const audiences = [
    { key: 'customer', label: 'Customer', on: rule.sendToCustomer, dot: 'bg-sky-500' },
    { key: 'agent', label: 'Agent', on: rule.sendToAgent, dot: 'bg-violet-500' },
    { key: 'admin', label: 'Admin', on: rule.sendToAdmin, dot: 'bg-brand-teal' },
  ].filter((a) => a.on);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {audiences.length === 0 ? (
        <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          No recipients
        </span>
      ) : (
        audiences.map((a) => (
          <span
            key={a.key}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200/70"
          >
            <span className={cn('size-1.5 rounded-full', a.dot)} />
            {a.label}
          </span>
        ))
      )}
      {rule.critical && (
        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-200/70">
          <ShieldAlert className="size-2.5" />
          Critical
        </span>
      )}
    </div>
  );
}

function EmailSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  // ── Provider config ──
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['email-provider-config'],
    queryFn: getEmailProviderConfig,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const [provider, setProvider] = useState<Provider>('smtp');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [testEmail, setTestEmail] = useState('');

  // Populate fields once the saved config arrives (don't clobber edits afterwards).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!config || hydratedRef.current) return;
    const raf = requestAnimationFrame(() => {
      hydratedRef.current = true;
      setProvider(config.selectedProvider ?? config.provider ?? 'smtp');
      if (config.smtp) {
        if (config.smtp.host) setSmtpHost(config.smtp.host);
        if (config.smtp.port) setSmtpPort(String(config.smtp.port));
        if (config.smtp.user) setSmtpUser(config.smtp.user);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [config]);

  const hasSmtpUser = Boolean(config?.smtp?.user);
  const hasResendKey = Boolean(config?.resend?.apiKey);

  // ── Rules ──
  const [ruleSearch, setRuleSearch] = useState('');
  const deferredRuleSearch = useDeferredValue(ruleSearch);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');

  const { data: rules, isLoading: rulesLoading, isFetching: rulesFetching } = useQuery({
    queryKey: ['email-rules'],
    queryFn: getEmailRules,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateEmailRule(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-rules'] });
      toast.success('Routing rule updated.');
    },
    onError: () => toast.error('Failed to update rule.'),
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (provider === 'smtp') {
        if (smtpHost) payload.host = smtpHost;
        if (smtpPort) payload.port = parseInt(smtpPort, 10);
        if (smtpUser) payload.user = smtpUser;
        if (smtpPass) payload.pass = smtpPass;
      } else {
        if (resendApiKey) payload.apiKey = resendApiKey;
      }
      return updateEmailProviderConfig(provider, payload);
    },
    onSuccess: () => {
      toast.success('Email configuration saved.');
      queryClient.invalidateQueries({ queryKey: ['email-provider-config'] });
    },
    onError: () => toast.error('Failed to save configuration.'),
  });

  const testConnection = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (provider === 'smtp') {
        if (smtpHost) payload.host = smtpHost;
        if (smtpPort) payload.port = parseInt(smtpPort, 10);
        if (smtpUser) payload.user = smtpUser;
        if (smtpPass) payload.pass = smtpPass;
      } else {
        if (resendApiKey) payload.apiKey = resendApiKey;
      }
      return testEmailProviderConnection(provider, payload);
    },
    onSuccess: (result) => toast.success(result.message),
    onError: () => toast.error('Connection test failed.'),
  });

  const handleSendTest = useMutation({
    mutationFn: () => sendTestEmail({ email: testEmail }),
    onSuccess: () => {
      toast.success('Test email queued successfully.');
      setTestEmail('');
    },
    onError: () => toast.error('Failed to queue test email.'),
  });

  const filteredRules = useMemo(() => {
    const list = rules ?? [];
    const q = ruleSearch.trim().toLowerCase();
    return list.filter((rule) => {
      if (q && !rule.type.toLowerCase().includes(q) && !(rule.description ?? '').toLowerCase().includes(q)) {
        return false;
      }
      switch (audienceFilter) {
        case 'customer': return rule.sendToCustomer;
        case 'agent': return rule.sendToAgent;
        case 'admin': return rule.sendToAdmin;
        case 'critical': return rule.critical;
        default: return true;
      }
    });
  }, [rules, ruleSearch, audienceFilter]);

  const enabledRulesCount = (rules ?? []).filter((r) => r.enabled).length;
  const activeProviderLabel = config?.selectedProvider === 'resend' ? 'Resend' : 'SMTP';
  const providerConfigured = config?.selectedProvider === 'resend' ? hasResendKey : hasSmtpUser;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Email Settings"
        description="Configure email provider and routing rules."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Emails' }]}
        actions={
          configLoading ? (
            <div className="h-7 w-36 animate-pulse rounded-full bg-muted" />
          ) : (
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium',
                providerConfigured
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700',
              )}
            >
              {providerConfigured ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
              {activeProviderLabel} · {providerConfigured ? 'Configured' : 'Needs credentials'}
            </div>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ── Provider configuration ── */}
        <section className="rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] xl:col-span-2" aria-busy={configLoading}>
          <header className="flex items-center gap-2.5 border-b border-border/50 px-5 py-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10">
              <Mail className="size-4 text-brand-teal" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Email Provider</h2>
              <p className="text-[11px] text-muted-foreground">Pick the delivery provider and its credentials.</p>
            </div>
          </header>

          <div className="space-y-5 px-5 py-5">
            {/* Segmented provider switch */}
            <div className="inline-flex w-full rounded-xl bg-muted/60 p-1 sm:w-auto" role="tablist" aria-label="Email provider">
              {([
                { key: 'smtp' as Provider, label: 'SMTP', icon: Server, hint: hasSmtpUser ? 'Saved' : 'Not configured' },
                { key: 'resend' as Provider, label: 'Resend', icon: KeyRound, hint: hasResendKey ? 'Saved' : 'Not configured' },
              ]).map((p) => {
                const Icon = p.icon;
                const active = provider === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setProvider(p.key)}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-150 sm:flex-none',
                      active
                        ? 'bg-card text-brand-teal shadow-sm ring-1 ring-border/70'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    {p.label}
                    <span
                      className={cn(
                        'hidden rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide sm:inline',
                        p.hint === 'Saved' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200/80 text-zinc-500',
                      )}
                    >
                      {p.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {provider === 'smtp' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="SMTP Host" placeholder="smtp.gmail.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} autoComplete="off" />
                <Input label="Port" placeholder="587" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" autoComplete="off" />
                <Input label="Username" placeholder="user@yourdomain.com" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" />
                <div>
                  <Input
                    label="Password"
                    type="password"
                    placeholder={hasSmtpUser ? 'Saved — leave blank to keep' : 'App password'}
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    autoComplete="new-password"
                  />
                  {hasSmtpUser && (
                    <p className="mt-1 text-[10px] text-muted-foreground">A password is already saved. Type only to replace it.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-md">
                <Input
                  label="API Key"
                  placeholder={hasResendKey ? 're_•••••••• (saved)' : 're_...'}
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  autoComplete="off"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {hasResendKey ? 'A key is already saved. Type only to replace it.' : 'Create the key in your Resend dashboard.'}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
              <Button
                onClick={() => saveConfig.mutate()}
                disabled={saveConfig.isPending}
                className="bg-brand-teal hover:bg-[#0a5a6b]"
              >
                {saveConfig.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
              <Button variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
                {testConnection.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Testing…
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground">Credentials are stored encrypted at rest.</p>
            </div>
          </div>
        </section>

        {/* ── Test send ── */}
        <section className="rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.06)]">
          <header className="flex items-center gap-2.5 border-b border-border/50 px-5 py-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10">
              <Send className="size-4 text-brand-teal" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Send Test Email</h2>
              <p className="text-[11px] text-muted-foreground">Verify the active provider end-to-end.</p>
            </div>
          </header>

          <div className="space-y-3 px-5 py-5">
            <Input
              label="Recipient"
              type="email"
              placeholder="you@yourdomain.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button
              onClick={() => handleSendTest.mutate()}
              disabled={handleSendTest.isPending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)}
              className="w-full bg-brand-teal hover:bg-[#0a5a6b]"
            >
              {handleSendTest.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" />
                  Send test email
                </>
              )}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Uses the currently active provider ({activeProviderLabel}). If it lands in spam, check
              SPF/DKIM records for your sending domain.
            </p>
          </div>
        </section>
      </div>

      {/* ── Routing rules ── */}
      <section className="rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.06)]">
        <header className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10">
              <Mail className="size-4 text-brand-teal" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Email Routing Rules</h2>
              <p className="text-[11px] text-muted-foreground">
                {rules ? `${enabledRulesCount} of ${rules.length} events send email` : 'Loading events…'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                type="search"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                placeholder="Search events…"
                aria-label="Search routing rules"
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20 sm:w-48"
              />
              {ruleSearch && (
                <button
                  type="button"
                  onClick={() => setRuleSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="flex w-fit items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Filter by audience">
              {AUDIENCE_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={audienceFilter === f}
                  onClick={() => setAudienceFilter(f)}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                    audienceFilter === f
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="divide-y divide-border/40">
          {rulesLoading ? (
            <div className="space-y-3 p-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-44 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-28 animate-pulse rounded bg-muted/70" />
                  </div>
                  <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
              <Search className="size-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No rules match your filters</p>
              <button
                type="button"
                onClick={() => { setRuleSearch(''); setAudienceFilter('all'); }}
                className="cursor-pointer text-xs font-semibold text-brand-teal hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filteredRules.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  'flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/25',
                  !rule.enabled && 'opacity-70',
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-sm font-semibold', rule.enabled ? 'text-foreground' : 'text-muted-foreground')}>
                      {prettyEventKey(rule.type)}
                    </p>
                    <code className="rounded bg-muted/70 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                      {rule.type}
                    </code>
                  </div>
                  {rule.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{rule.description}</p>
                  )}
                  <RuleAudienceBadges rule={rule} />
                </div>

                <Switch
                  label={`Send email for ${prettyEventKey(rule.type)}`}
                  checked={rule.enabled}
                  onChange={(next) => toggleRule.mutate({ id: rule.id, enabled: next })}
                  disabled={toggleRule.isPending}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default function EmailsPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.EMAILS_READ]}>
      <EmailSettingsPage />
    </RequirePagePermission>
  );
}
