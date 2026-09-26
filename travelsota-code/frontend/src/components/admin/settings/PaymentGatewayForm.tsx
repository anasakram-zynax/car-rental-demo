"use client";
import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import {
  getStripeConfig,
  setStripeCredentials,
  testStripeConnection,
  getPayPalConfig,
  setPayPalCredentials,
  testPayPalConnection,
  getPaymentGatewayMeta,
  type PaymentGatewayKey,
} from "@/features/admin/api/admin-settings-payment";
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

function ChevronLeftSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const baseInput =
  "h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20";
const baseSelect =
  "h-11 w-full appearance-none rounded-lg border border-input bg-background px-3.5 pr-11 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
}

const STRIPE_FIELDS: FieldDef[] = [
  { key: "publishableKey", label: "Publishable Key", placeholder: "pk_test_..." },
  { key: "secretKey", label: "Secret Key", placeholder: "sk_test_..." },
  { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_..." },
];

const PAYPAL_FIELDS: FieldDef[] = [
  { key: "clientId", label: "Client ID", placeholder: "PayPal client ID" },
  { key: "clientSecret", label: "Client Secret", placeholder: "PayPal client secret" },
  { key: "webhookId", label: "Webhook ID", placeholder: "PayPal webhook ID" },
];

interface PaymentGatewayFormProps {
  gatewayKey: PaymentGatewayKey;
  onBack: () => void;
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  if (!configured) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success-600 dark:bg-success-900/20 dark:text-success-400">
      <CheckCircleSvg className="size-2.5" />
      Configured
    </span>
  );
}

export default function PaymentGatewayForm({
  gatewayKey,
  onBack,
}: PaymentGatewayFormProps) {
  const meta = getPaymentGatewayMeta(gatewayKey);
  const isStripe = gatewayKey === "stripe";
  const fields = isStripe ? STRIPE_FIELDS : PAYPAL_FIELDS;
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState(isStripe ? "test" : "sandbox");
  const [configuredFields, setConfiguredFields] = useState<Set<string>>(new Set());

  function clearFields() {
    for (const f of fields) {
      if (fieldRefs.current[f.key]) {
        fieldRefs.current[f.key]!.value = "";
      }
    }
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
      const res = isStripe ? await getStripeConfig() : await getPayPalConfig();
      setEnabled(res.enabled);
      const cfg = res.config as Record<string, unknown>;
      setEnvironment((cfg.environment as string) ?? (isStripe ? "test" : "sandbox"));
      const configured = new Set<string>();
      for (const f of fields) {
        if (cfg[f.key]) configured.add(f.key);
      }
      setConfiguredFields(configured);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load gateway config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(load); }, []);

  async function doSave(showNotice = true) {
    const fieldValues = readFields();
    const payload: Record<string, unknown> = { environment };
    for (const f of fields) {
      if (fieldValues[f.key]) payload[f.key] = fieldValues[f.key];
    }
    const saveFn = isStripe ? setStripeCredentials : setPayPalCredentials;
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
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await doSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save credentials.");
    } finally {
      setSaving(false);
      clearFields();
    }
  }

  async function onTest() {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const fieldValues = readFields();
      const hasInput = fields.some((f) => fieldValues[f.key]);
      if (hasInput) {
        await doSave(false);
        clearFields();
      }
      const testFn = isStripe ? testStripeConnection : testPayPalConnection;
      const res = await testFn();
      if (res.ok) {
        setNotice(`Connection successful: ${res.message}`);
        setTimeout(() => setNotice(null), 4000);
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setTesting(false);
      clearFields();
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
        Back to payment overview
      </button>

      <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
            <Image
              src={`/images/providers/${gatewayKey}.png`}
              alt={`${meta.label} logo`}
              width={48}
              height={48}
              className="size-full object-contain"
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
            {isStripe ? (
              <>
                <option value="test">Test</option>
                <option value="production">Production</option>
              </>
            ) : (
              <>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </>
            )}
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
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key}>
              <Label>
                {field.label}
                <ConfiguredBadge configured={configuredFields.has(field.key)} />
              </Label>
              <input
                ref={(el) => { fieldRefs.current[field.key] = el; }}
                className={baseInput}
                type="password"
                placeholder={field.placeholder}
                disabled={saving || testing}
              />
            </div>
          ))}
        </div>
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
