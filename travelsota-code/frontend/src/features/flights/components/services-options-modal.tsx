"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { decodeService, encodeService, formatCurrency } from "@/features/flights/utils/ancillary-utils";
import type { ApiServiceOption } from "@/features/flights/api/ancillaries";

interface ServiceOption {
  productId: string;
  label: string;
  description: string;
  serviceType: string;
  price: number;
  currency: string;
  /** Supplier identifiers preserved from catalog for Travelport add */
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
}

interface ServiceOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelerCount: number;
  existingSelections: string[];
  onConfirm: (encodedServices: string[]) => void;
  /** Real service options from the API */
  apiServiceOptions?: ApiServiceOption[];
  /** Loading state while fetching from API */
  loading?: boolean;
  /** Error message if the API call failed */
  error?: string;
  /** Currency formatter — converts supplier amount+currency to display currency */
  formatPrice?: (amount: number, sourceCurrency: string) => string;
}

/** Get icon for a service type */
function ServiceIcon({ type }: { type: string }) {
  const className = "h-5 w-5";
  switch (type) {
    case "priority":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      );
    case "lounge":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h3a2.25 2.25 0 012.25 2.25V9m0 0h-7.5M21 12.75v4.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25v-4.5A2.25 2.25 0 015.25 10.5h13.5A2.25 2.25 0 0121 12.75z" />
        </svg>
      );
    case "wifi":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
        </svg>
      );
    case "pet":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
        </svg>
      );
    case "sports_equipment":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-8.49 4.09 2.61-8.45 6.9-6.9a2.25 2.25 0 013.18 0l3.18 3.18a2.25 2.25 0 010 3.18l-6.9 6.9-8.45 2.61 4.09-8.49z" />
        </svg>
      );
  }
}

/** Get badge color for a service type */
function getServiceColor(type: string): string {
  switch (type) {
    case "priority": return "bg-amber-100 text-amber-700 border-amber-200";
    case "lounge": return "bg-purple-100 text-purple-700 border-purple-200";
    case "wifi": return "bg-blue-100 text-blue-700 border-blue-200";
    case "pet": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "sports_equipment": return "bg-rose-100 text-rose-700 border-rose-200";
    default: return "bg-zinc-100 text-zinc-600 border-zinc-200";
  }
}

function getServiceLabel(type: string): string {
  switch (type) {
    case "priority": return "Priority";
    case "lounge": return "Lounge";
    case "wifi": return "WiFi";
    case "pet": return "Pet";
    case "sports_equipment": return "Sports";
    case "other": return "Service";
    default: return type;
  }
}

export function ServiceOptionsModal({
  isOpen,
  onClose,
  travelerCount,
  existingSelections,
  onConfirm,
  apiServiceOptions,
  loading,
  error,
  formatPrice,
}: ServiceOptionsModalProps) {
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const selectedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const encoded of existingSelections) {
      const decoded = decodeService(encoded);
      if (decoded?.productId) ids.add(decoded.productId);
    }
    return ids;
  }, [existingSelections]);

  // Service options come exclusively from live API data
  const serviceOptions: ServiceOption[] = useMemo(() => {
    if (apiServiceOptions && apiServiceOptions.length > 0) {
      return apiServiceOptions.map((api) => ({
        productId: api.productId,
        label: api.label,
        description: api.description,
        serviceType: api.serviceType,
        price: api.priceAmount,
        currency: api.currency,
        catalogOfferingIdentifier: api.catalogOfferingIdentifier,
        catalogOfferingsIdentifier: api.catalogOfferingsIdentifier,
      }));
    }
    return [];
  }, [apiServiceOptions]);

  function toggleOption(option: ServiceOption) {
    const next = new Set(selectedProductIds);
    if (next.has(option.productId)) {
      next.delete(option.productId);
    } else {
      next.add(option.productId);
    }

    const encoded = Array.from(next).map((pid) => {
      const opt = serviceOptions.find((s) => s.productId === pid)!;
      return encodeService({
        productId: opt.productId,
        label: opt.label,
        serviceType: opt.serviceType,
        priceText: `${opt.price.toFixed(2)} ${opt.currency}`,
        catalogOfferingIdentifier: opt.catalogOfferingIdentifier,
        catalogOfferingsIdentifier: opt.catalogOfferingsIdentifier,
      });
    });
    onConfirm(encoded);
  }

  const totalPrice = useMemo(() => {
    return Array.from(selectedProductIds).reduce((sum, pid) => {
      const opt = serviceOptions.find((s) => s.productId === pid);
      return sum + (opt?.price ?? 0);
    }, 0);
  }, [selectedProductIds, serviceOptions]);

  const selectedCount = selectedProductIds.size;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-8.49 4.09 2.61-8.45 6.9-6.9a2.25 2.25 0 013.18 0l3.18 3.18a2.25 2.25 0 010 3.18l-6.9 6.9-8.45 2.61 4.09-8.49z" />
          </svg>
          <span>{t('addServices')}</span>
        </div>
      }
      className="max-w-md"
    >
      {/* Info bar */}
      <div className="flex items-center justify-between bg-gradient-to-r from-zinc-50 to-zinc-50/50 -mx-6 -mt-2 px-6 py-3 border-b border-zinc-100 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">{t('servicesInfoBar')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-zinc-400">{t('travelerCount', { count: travelerCount })}</span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <svg className="h-8 w-8 text-zinc-300 animate-spin mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm font-medium text-zinc-500">{t('loadingServices')}</p>
          <p className="text-xs text-zinc-400 mt-1">{t('fetchingServices')}</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <svg className="h-10 w-10 text-red-300 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm font-medium text-red-500">{t('servicesUnavailableTitle')}</p>
          <p className="text-xs text-zinc-400 mt-1">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg border border-zinc-200 px-3.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
          >
            {tc('close')}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && serviceOptions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <svg className="h-10 w-10 text-zinc-300 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-8.49 4.09 2.61-8.45 6.9-6.9a2.25 2.25 0 013.18 0l3.18 3.18a2.25 2.25 0 010 3.18l-6.9 6.9-8.45 2.61 4.09-8.49z" />
          </svg>
          <p className="text-sm font-medium text-zinc-500">{t('noServicesTitle')}</p>
          <p className="text-xs text-zinc-400 mt-1">{t('noServicesDesc')}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg border border-zinc-200 px-3.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
          >
            {tc('close')}
          </button>
        </div>
      )}

      {/* Service option list */}
      {!loading && !error && serviceOptions.length > 0 && (
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {serviceOptions.map((option) => {
          const isSelected = selectedProductIds.has(option.productId);
          return (
            <button
              key={option.productId}
              type="button"
              onClick={() => toggleOption(option)}
              className={`w-full flex items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-indigo-200 bg-indigo-50/50 ring-1 ring-indigo-500/20"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {/* Icon */}
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                <ServiceIcon type={option.serviceType} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900">{option.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{option.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-zinc-800">
                      {formatPrice ? formatPrice(option.price, option.currency) : formatCurrency(option.price, option.currency)}
                    </p>
                    {isSelected && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 mt-0.5">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {t('addedBadge')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Service type badge */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium border ${getServiceColor(option.serviceType)}`}>
                    {getServiceLabel(option.serviceType)}
                  </span>
                </div>
              </div>

              {/* Selection indicator */}
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600"
                    : "border-zinc-300 bg-white"
                }`}
              >
                {isSelected && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
      )}

      {/* Footer */}
      {!loading && !error && serviceOptions.length > 0 && (
      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {selectedCount > 0
              ? t('servicesSelectedCount', { count: selectedCount })
              : t('noServicesSelected')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
          >
            {tc('cancel')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={totalPrice <= 0}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              totalPrice <= 0
                ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                : "bg-brand-teal text-white hover:bg-[#012830] shadow-md shadow-brand-teal/30"
            }`}
          >
            {totalPrice > 0 ? (
              <>
                <span>{tc('done')}</span>
                <span className="text-white/80">· {(() => {
                  const firstSelected = Array.from(selectedProductIds).map(pid => serviceOptions.find(s => s.productId === pid)).find(Boolean);
                  return formatPrice ? formatPrice(totalPrice, firstSelected?.currency ?? "USD") : formatCurrency(totalPrice, firstSelected?.currency ?? "USD");
                })()}</span>
              </>
            ) : (
              tc('done')
            )}
          </button>
        </div>
      </div>
      )}
    </Modal>
  );
}
