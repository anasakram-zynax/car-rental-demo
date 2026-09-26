"use client";

import Image from "next/image";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Landmark, Settings2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Switch from "@/components/form/switch/Switch";
import {
  getPaymentGatewayMeta,
  getPaymentGatewayDocsUrl,
  isManualGatewayKey,
  type PaymentGatewayKey,
} from "@/features/admin/api/admin-settings-payment";

interface PaymentMethodCardProps {
  gatewayKey: PaymentGatewayKey;
  enabled: boolean;
  onToggle?: (next: boolean) => void;
  onSettings?: () => void;
  saving?: boolean;
  statusUnavailable?: boolean;
}

export default function PaymentMethodCard({
  gatewayKey,
  enabled,
  onToggle,
  onSettings,
  saving = false,
  statusUnavailable = false,
}: PaymentMethodCardProps) {
  const meta = getPaymentGatewayMeta(gatewayKey);
  const statusLabel = statusUnavailable ? "Unavailable" : enabled ? "Active" : "Inactive";
  const StatusIcon = statusUnavailable ? AlertCircle : enabled ? CheckCircle2 : XCircle;
  const manual = isManualGatewayKey(gatewayKey);
  const ManualIcon = gatewayKey === 'bank_transfer' ? Landmark : Clock;
  const docsUrl = getPaymentGatewayDocsUrl(gatewayKey);

  return (
    <article
      data-payment-gateway-row={gatewayKey}
      data-payment-state={statusUnavailable ? "unavailable" : enabled ? "active" : "inactive"}
      className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/50 bg-card px-4 py-3 transition-[border-color,background-color] duration-150 hover:border-primary/20 hover:bg-muted/30"
    >
      {/* Logo (manual methods use an icon — no brand asset) */}
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        {manual ? (
          <span className={`flex size-full items-center justify-center ${meta.accentBg}`}>
            <ManualIcon className={`size-5 ${meta.accent}`} aria-hidden />
          </span>
        ) : (
          <Image
            src={`/images/providers/${gatewayKey}.png`}
            alt={`${meta.label} logo`}
            width={36}
            height={36}
            className="size-full object-contain"
          />
        )}
      </div>

      {/* Info */}
      <div className="min-w-[140px] flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{meta.label}</h3>
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground ring-1 ring-border/50">
            <StatusIcon className="size-2.5" aria-hidden />
            {statusLabel}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{meta.description}</p>
      </div>

      {/* Toggle */}
      <div className="flex shrink-0 items-center gap-3 ms-auto">
        {onToggle ? (
          <Switch
            label=""
            checked={enabled}
            ariaLabel={`Enable ${meta.label}`}
            onChange={onToggle}
            disabled={statusUnavailable}
            busy={saving}
            color="blue"
          />
        ) : null}

        {onSettings && !statusUnavailable ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onSettings}
            className="h-9 gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-200 active:scale-[0.98]"
          >
            <Settings2 className="size-3" aria-hidden />
            Configure
          </Button>
        ) : null}

        {docsUrl ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(docsUrl, "_blank", "noopener,noreferrer")}
            className="h-9 rounded-lg px-2 text-xs font-medium"
            aria-label={`Open ${meta.label} documentation`}
          >
            <ExternalLink className="size-3" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
