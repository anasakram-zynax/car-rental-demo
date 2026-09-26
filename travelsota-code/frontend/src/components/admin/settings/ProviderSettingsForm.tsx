"use client";
import React, { useEffect, useState, useRef } from "react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { suppressDuplicateSuccess } from "@/features/notifications/lib/actor-event-dedupe";
import Image from "next/image";
import {
  getTravelportProvider,
  setTravelportCredentials,
  testTravelportConnection,
  getHotelbedsProvider,
  setHotelbedsCredentials,
  testHotelbedsConnection,
  getRatehawkProvider,
  setRatehawkCredentials,
  testRatehawkConnection,
  getDuffleProvider,
  setDuffleCredentials,
  testDuffleConnection,
  getAmadeusProvider,
  getAmadeusHotelsProvider,
  setAmadeusCredentials,
  setAmadeusHotelsCredentials,
  testAmadeusConnection,
  testAmadeusHotelsConnection,
  getTravelportStaysProvider,
  setTravelportStaysCredentials,
  testTravelportStaysConnection,
  getProviderMeta,
  type ProviderKey,
  type ProviderConnectionTestResult,
} from "@/features/admin/api/admin-settings";
import { Button } from "@/components/ui/button";
import Label from "@/components/form/Label";
import { ChevronDownIcon } from "@/icons";

function CheckCircleSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertCircleSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function EyeSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function ChevronLeftSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ── Per-provider field lists (all masked) ──
type ProviderFields = ReadonlyArray<{ key: string; label: string; placeholder: string }>;

const PROVIDER_FIELDS: Record<ProviderKey, ProviderFields> = {
  travelport: [
    { key: "username", label: "Username", placeholder: "Travelport username" },
    { key: "password", label: "Password", placeholder: "Travelport password" },
    { key: "clientId", label: "Client ID", placeholder: "OAuth client ID" },
    { key: "clientSecret", label: "Client Secret", placeholder: "OAuth client secret" },
    { key: "accessGroup", label: "Access Group", placeholder: "Travelport access group" },
    { key: "pcc", label: "PCC", placeholder: "Pseudo City Code" },
  ],
  "travelport-stays": [
    { key: "username", label: "Username", placeholder: "Travelport Stays username" },
    { key: "password", label: "Password", placeholder: "Travelport Stays password" },
    { key: "clientId", label: "Client ID", placeholder: "OAuth client ID" },
    { key: "clientSecret", label: "Client Secret", placeholder: "OAuth client secret" },
    { key: "accessGroup", label: "Access Group", placeholder: "Travelport access group" },
    { key: "pcc", label: "PCC (optional)", placeholder: "Pseudo City Code" },
    { key: "gds", label: "GDS (optional)", placeholder: "e.g. 1G" },
  ],
  duffel: [
    { key: "accessToken", label: "Access Token", placeholder: "Duffel access token" },
  ],
  amadeus: [
    { key: "clientId", label: "API Key", placeholder: "Amadeus API key" },
    { key: "clientSecret", label: "API Secret", placeholder: "Amadeus API secret" },
  ],
  hotelbeds: [
    { key: "apiKey", label: "API Key", placeholder: "Hotelbeds API key" },
    { key: "secret", label: "Secret", placeholder: "Hotelbeds secret" },
  ],
  ratehawk: [
    { key: "keyId", label: "Key ID", placeholder: "RateHawk Key ID (numeric, e.g. 657)" },
    { key: "apiKey", label: "API Key", placeholder: "RateHawk API key (UUID)" },
  ],
};

type EnvironmentOption = { label: string; value: string };

const ENVIRONMENTS: Record<ProviderKey, EnvironmentOption[]> = {
  travelport: [
    { label: "Development", value: "development" },
    { label: "Production", value: "production" },
  ],
  "travelport-stays": [
    { label: "Development", value: "development" },
    { label: "Production", value: "production" },
  ],
  hotelbeds: [
    { label: "Development", value: "development" },
    { label: "Production", value: "production" },
    { label: "mTLS", value: "mtls" },
  ],
  ratehawk: [
    { label: "Sandbox", value: "sandbox" },
    { label: "Production", value: "production" },
  ],
  duffel: [
    { label: "Sandbox", value: "sandbox" },
    { label: "Production", value: "production" },
  ],
  amadeus: [
    { label: "Test", value: "test" },
    { label: "Production", value: "production" },
  ],
};

interface ProviderSettingsFormProps {
  providerKey: ProviderKey;
  module?: "flights" | "hotels";
  onBack: () => void;
}

const baseInput =
  "h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20";
const baseSelect =
  "h-11 w-full appearance-none rounded-lg border border-input bg-background px-3.5 pr-11 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground";

function ConfiguredBadge({ configured }: { configured: boolean }) {
  if (!configured) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success-600 dark:bg-success-900/20 dark:text-success-400">
      <CheckCircleSvg className="size-2.5" />
      Configured
    </span>
  );
}

export default function ProviderSettingsForm({
  providerKey,
  module,
  onBack,
}: ProviderSettingsFormProps) {
  const meta = getProviderMeta(providerKey);
  const effectiveModule = module ?? (meta as any).module ?? 'flights';
  const fields = PROVIDER_FIELDS[providerKey];
  const envOptions = ENVIRONMENTS[providerKey];

  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState(envOptions[0].value);
  const [configuredFields, setConfiguredFields] = useState<Set<string>>(new Set());
  const [configuredLengths, setConfiguredLengths] = useState<Record<string, number>>({});
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);

  function clearFields() {
    for (const f of fields) {
      if (fieldRefs.current[f.key]) {
        fieldRefs.current[f.key]!.value = "";
      }
    }
    // Security: after saving, no field ever holds a real credential in the DOM.
    setRevealedFields(new Set());
  }

  function readFields(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const f of fields) {
      values[f.key] = fieldRefs.current[f.key]?.value ?? "";
    }
    return values;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let res: any;
      if (providerKey === "travelport") res = await getTravelportProvider();
      else if (providerKey === "travelport-stays") res = await getTravelportStaysProvider();
      else if (providerKey === "duffel") res = await getDuffleProvider();
      else if (providerKey === "amadeus") {
        res = await (effectiveModule === "hotels" ? getAmadeusHotelsProvider() : getAmadeusProvider());
      }
      else if (providerKey === "hotelbeds") res = await getHotelbedsProvider();
      else res = await getRatehawkProvider();

      setEnabled(res.enabled);
      const cfg: Record<string, unknown> = res.config ?? {};
      setEnvironment((cfg.environment as string) ?? envOptions[0].value);
      const configured = new Set<string>();
      const lengths: Record<string, number> = {};
      for (const f of fields) {
        if (cfg[f.key]) configured.add(f.key);
        const len = cfg[`${f.key}Length`];
        if (typeof len === "number" && len > 0) lengths[f.key] = len;
      }
      setConfiguredFields(configured);
      setConfiguredLengths(lengths);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load provider config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(load); }, []);

  function getTestFn() {
    if (providerKey === "travelport") return testTravelportConnection;
    if (providerKey === "travelport-stays") return testTravelportStaysConnection;
    if (providerKey === "duffel") return testDuffleConnection;
    if (providerKey === "amadeus") return effectiveModule === "hotels" ? testAmadeusHotelsConnection : testAmadeusConnection;
    if (providerKey === "hotelbeds") return testHotelbedsConnection;
    return testRatehawkConnection;
  }

  function getSaveFn() {
    if (providerKey === "travelport") return setTravelportCredentials;
    if (providerKey === "travelport-stays") return setTravelportStaysCredentials;
    if (providerKey === "duffel") return setDuffleCredentials;
    if (providerKey === "amadeus") return effectiveModule === "hotels" ? setAmadeusHotelsCredentials : setAmadeusCredentials;
    if (providerKey === "hotelbeds") return setHotelbedsCredentials;
    return setRatehawkCredentials;
  }

  async function doSave(showNotice = true) {
    const fieldValues = readFields();
    const payload: Record<string, unknown> = { environment };
    for (const f of fields) {
      // Trim before sending — pasted credentials often carry stray whitespace
      // (the backend trims too, but never send dirty values in the first place).
      const trimmed = fieldValues[f.key].trim();
      if (trimmed) payload[f.key] = trimmed;
    }

    // Travelport needs at least one channel identifier: Access Group (NDC)
    // or PCC (GDS). Only enforce when the stored config has neither — an
    // empty input keeps the stored value on merge-preserving saves.
    if (providerKey === "travelport") {
      const hasAccessGroup =
        Boolean(payload.accessGroup) || configuredFields.has("accessGroup");
      const hasPcc = Boolean(payload.pcc) || configuredFields.has("pcc");
      if (!hasAccessGroup && !hasPcc) {
        throw new Error(
          "Provide an Access Group (for NDC) or a PCC (for GDS). Either one alone is enough — both are only needed if your account uses both channels.",
        );
      }
    }

    const saveFn = getSaveFn();
    const res = await saveFn(payload as any);
    setEnabled(res.enabled);

    const configured = new Set<string>();
    for (const f of fields) {
      if (fieldValues[f.key]) configured.add(f.key);
      else if (configuredFields.has(f.key)) configured.add(f.key);
    }
    setConfiguredFields(configured);

    if (showNotice) {
      setNotice("Credentials saved successfully.");
      setTimeout(() => setNotice(null), 3000);
    }
  }

  async function onSave() {
    if (environment === "production") {
      if (!(await confirmDialog({ title: `Save production credentials for ${meta.label}?`, message: 'This will update the live supplier configuration.', confirmLabel: 'Save' }))) return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await doSave();
      // Backend emits 'settings.provider_credentials_updated' — the live
      // notification is the single source; notice banner stays for context.
      suppressDuplicateSuccess('settings.provider_credentials_updated');
      // Security: clear the DOM inputs only AFTER a successful save so a
      // failure never wipes what the admin typed.
      clearFields();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    if (environment === "production") {
      if (!(await confirmDialog({ title: `Test production credentials for ${meta.label}?`, message: 'This will contact the live supplier API.', confirmLabel: 'Proceed' }))) return;
    }
    setTesting(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      // Test Connection always verifies the saved DB row — it never reads
      // the (possibly stale, possibly blank-after-save) input fields. Save
      // first if you want to test new values.
      const testFn = getTestFn();
      const result = await testFn();
      setTestResult(result);
      if (result.success) {
        setNotice(`Connection test passed for ${meta.label}.`);
      } else {
        setError(result.summary || `Connection test failed for ${meta.label}.`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="flex items-center gap-3">
          <div className="size-9 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: fields.length + 1 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-[color,background-color] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        <ChevronLeftSvg className="size-4" aria-hidden />
        Back to modules overview
      </button>

      <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
            <Image
              src={`/images/providers/${providerKey}.png`}
              alt={`${meta.label} logo`}
              width={48}
              height={48}
              className="size-full object-contain"
              onError={(event) => {
                const image = event.currentTarget;
                if (!image.src.endsWith(`/${providerKey}.svg`)) {
                  image.src = `/images/providers/${providerKey}.svg`;
                }
              }}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">{meta.label}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${enabled ? "bg-success-50 text-success-700" : "bg-muted text-muted-foreground"}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${enabled ? "bg-success-500" : "bg-muted-foreground/45"}`} />
                {enabled ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Environment</h3>
        </div>
        <div className="relative max-w-xs">
          <select
            className={baseSelect}
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            disabled={saving || testing}
          >
            {envOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <ChevronDownIcon className="size-4" aria-hidden />
          </span>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Credentials</h3>
        </div>
        {providerKey === "ratehawk" && (
          <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            From your RateHawk partner portal: <strong>Key ID</strong> = the numeric
            key id (used as the Basic-auth username), <strong>API Key</strong> = the
            secret key / UUID (used as the Basic-auth password). They must match the
            same sandbox or production contract.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            const isRevealed = revealedFields.has(field.key);
            const isConfigured = configuredFields.has(field.key);
            const storedLength = configuredLengths[field.key];
            // After save the input is EMPTY; the placeholder shows dots
            // matching the stored credential's LENGTH (never its content).
            const placeholder = isConfigured
              ? storedLength
                ? "•".repeat(Math.min(storedLength, 40))
                : "Saved — enter a new value to replace"
              : field.placeholder;
            return (
              <div key={field.key}>
                <Label>
                  {field.label}
                  <ConfiguredBadge configured={isConfigured} />
                </Label>
                <div className="relative">
                  <input
                    ref={(el) => { fieldRefs.current[field.key] = el; }}
                    className={`${baseInput} pr-11`}
                    type={isRevealed ? "text" : "password"}
                    placeholder={placeholder}
                    disabled={saving || testing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedFields((prev) => {
                        const next = new Set(prev);
                        if (next.has(field.key)) next.delete(field.key);
                        else next.add(field.key);
                        return next;
                      })
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                    aria-label={isRevealed ? `Hide ${field.label}` : `Show ${field.label}`}
                    title={isRevealed ? "Hide" : "Show"}
                  >
                    {isRevealed ? <EyeOffSvg className="size-4" /> : <EyeSvg className="size-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {providerKey === "travelport" && (
          <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            Provide <strong>at least one channel identifier</strong>: an{" "}
            <strong>Access Group</strong> (required to book NDC offers) or a{" "}
            <strong>PCC</strong> (required to book GDS offers). Either one alone
            is enough — both are only needed if your account uses both channels.
            Values are trimmed automatically when saved.
          </p>
        )}
      </section>

      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
          <CheckCircleSvg className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
          <AlertCircleSvg className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Test Connection Terminal */}
      {testResult && (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {testResult.provider} · {testResult.environment} · {(testResult.durationMs ?? 0)}ms
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
            <div className="text-emerald-400">$ connection test — {meta.label}</div>
            {(testResult.checks ?? []).map((check) => (
              <div key={check.id} className="py-0.5">
                <span className={check.status === 'success' ? 'text-emerald-400' : check.status === 'failed' ? 'text-red-400' : check.status === 'warning' ? 'text-amber-400' : 'text-blue-400'}>
                  [{check.status.toUpperCase()}]
                </span>{' '}
                <span className="text-zinc-400">{check.label}:</span>{' '}
                <span className="text-zinc-300">{check.message}</span>
                {typeof check.durationMs === 'number' && (
                  <span className="text-zinc-600"> ({check.durationMs}ms)</span>
                )}
              </div>
            ))}
            <div className="pt-2 text-zinc-500">$ summary: {testResult.summary}</div>
            {(testResult.warnings ?? []).map((w, i) => (
              <div key={i} className="text-amber-400">! {w.message}</div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary" size="md" loading={saving} onClick={onSave} disabled={testing}>
            {saving ? "Saving..." : "Save Credentials"}
          </Button>
          <Button variant="secondary" size="md" loading={testing} onClick={onTest} disabled={saving}>
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button variant="ghost" size="md" onClick={load} disabled={saving || testing}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
