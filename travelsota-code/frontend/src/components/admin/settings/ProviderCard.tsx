"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Settings2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Switch from "@/components/form/switch/Switch";
import {
  getProviderMeta,
  getProviderDocsUrl,
  type ProviderKey,
} from "@/features/admin/api/admin-settings";

interface ProviderCardProps {
  providerKey: ProviderKey;
  module?: "flights" | "hotels";
  enabled: boolean;
  onToggle?: (next: boolean) => void;
  onSettings?: () => void;
  saving?: boolean;
  statusUnavailable?: boolean;
  /** Slot-level overrides — used by Managed (manual) cards for distinct identity. */
  displayName?: string;
  description?: string;
  icon?: ReactNode;
}

export default function ProviderCard({
  providerKey,
  module,
  enabled,
  onToggle,
  onSettings,
  saving = false,
  statusUnavailable = false,
  displayName,
  description,
  icon,
}: ProviderCardProps) {
  const meta = getProviderMeta(providerKey);
  const label = displayName ?? meta.label;
  const moduleLabel = module ?? meta.module;
  const statusLabel = statusUnavailable ? "Unavailable" : enabled ? "Active" : "Inactive";
  const StatusIcon = statusUnavailable ? AlertCircle : enabled ? CheckCircle2 : XCircle;
  const docsUrl = getProviderDocsUrl(providerKey);

  return (
    <article
      data-provider-card={providerKey}
      data-provider-state={statusUnavailable ? "unavailable" : enabled ? "active" : "inactive"}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_4px_16px_-10px_hsl(var(--foreground)/0.16)] focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10"
    >
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3 pt-3.5">
        <div className="flex items-start gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-[1.04]">
            {icon ?? (
              <Image
                src={`/images/providers/${providerKey}.png`}
                alt={`${meta.label} logo`}
                width={36}
                height={36}
                className="size-full object-contain"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (!image.src.endsWith(`/${providerKey}.svg`)) {
                    image.src = `/images/providers/${providerKey}.svg`;
                  }
                }}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                  {label}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
                    {moduleLabel === "flights" ? "Flights" : "Hotels"}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">{meta.tag}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-medium ${statusUnavailable ? "text-warning-600" : enabled ? "text-success-600" : "text-muted-foreground"}`}
                  >
                    <StatusIcon className="size-2.5" aria-hidden />
                    {statusLabel}
                  </span>
                </div>
              </div>

              {onToggle ? (
                <Switch
                  label=""
                  checked={enabled}
                  ariaLabel={`Enable ${label}`}
                  onChange={onToggle}
                  disabled={statusUnavailable}
                  busy={saving}
                  color="blue"
                />
              ) : null}
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-5 text-muted-foreground line-clamp-2">{description ?? meta.description}</p>
      </div>

      <div className="flex items-center gap-2 border-t border-border/50 bg-muted/10 px-3.5 py-2">
        {onSettings && !statusUnavailable ? (
          <Button
            variant="primary"
            size="sm"
            onClick={onSettings}
            className="h-7 flex-1 rounded-lg px-2.5 text-[11px] font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
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
            className="h-7 rounded-lg px-2.5 text-[11px] font-medium"
            aria-label={`Open ${label} documentation`}
          >
            <ExternalLink className="size-3" aria-hidden />
            Docs
          </Button>
        ) : null}
      </div>
    </article>
  );
}
