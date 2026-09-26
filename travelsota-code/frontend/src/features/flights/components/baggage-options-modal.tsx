"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { encodeBaggage, decodeBaggage, formatCurrency } from "@/features/flights/utils/ancillary-utils";
import type { ApiBaggageOption } from "@/features/flights/api/ancillaries";

interface BaggageOption {
  productId: string;
  label: string;
  description: string;
  price: number;
  currency: string;
  icon: "suitcase" | "sports" | "cabin";
  weight: string;
  maxSize: string;
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
  travelerIdentifierRef?: string;
}

interface BaggageOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingSelections: string[];
  onConfirm: (encodedBaggage: string[]) => void;
  apiBaggageOptions?: ApiBaggageOption[];
  loading?: boolean;
  error?: string;
  /** Summary label when included baggage exists (e.g. "Carry-on + Checked bag") */
  includedBaggageLabel?: string;
  /** Currency formatter — converts supplier amount+currency to display currency */
  formatPrice?: (amount: number, sourceCurrency: string) => string;
}

function BaggageIconSvg({ type }: { type: BaggageOption["icon"] }) {
  if (type === "sports") {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75v7.5m0 0H6m3.75 0h3.75M6 11.25V21m12.75-17.25v7.5m0 0H15m3.75 0h3.75M15 11.25V21" />
      </svg>
    );
  }
  if (type === "cabin") {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5" />
    </svg>
  );
}

export function BaggageOptionsModal({
  isOpen,
  onClose,
  existingSelections,
  onConfirm,
  apiBaggageOptions,
  loading,
  error,
  includedBaggageLabel,
  formatPrice,
}: BaggageOptionsModalProps) {
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const selectedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const encoded of existingSelections) {
      const decoded = decodeBaggage(encoded);
      if (decoded?.productId) ids.add(decoded.productId);
    }
    return ids;
  }, [existingSelections]);

  const baggageOptions: BaggageOption[] = useMemo(() => {
    if (apiBaggageOptions && apiBaggageOptions.length > 0) {
      return apiBaggageOptions.map((api) => ({
        productId: api.productId,
        label: api.label,
        description: api.description,
        price: api.priceAmount,
        currency: api.currency,
        icon: api.icon ?? 'suitcase',
        weight: api.weight,
        maxSize: api.maxSize,
        catalogOfferingIdentifier: api.catalogOfferingIdentifier,
        catalogOfferingsIdentifier: api.catalogOfferingsIdentifier,
        travelerIdentifierRef: api.travelerIdentifierRef,
      }));
    }
    return [];
  }, [apiBaggageOptions]);

  function toggleOption(option: BaggageOption) {
    const next = new Set(selectedProductIds);
    if (next.has(option.productId)) {
      next.delete(option.productId);
    } else {
      next.add(option.productId);
    }

    const encoded = Array.from(next).map((pid) => {
      const opt = baggageOptions.find((b) => b.productId === pid)!;
      return encodeBaggage({
        productId: opt.productId,
        label: opt.label,
        priceText: `${opt.price.toFixed(2)} ${opt.currency}`,
        catalogOfferingIdentifier: opt.catalogOfferingIdentifier,
        catalogOfferingsIdentifier: opt.catalogOfferingsIdentifier,
        travelerIdentifierRef: opt.travelerIdentifierRef,
      });
    });
    onConfirm(encoded);
  }

  const totalPrice = useMemo(() => {
    return Array.from(selectedProductIds).reduce((sum, pid) => {
      const opt = baggageOptions.find((b) => b.productId === pid);
      return sum + (opt?.price ?? 0);
    }, 0);
  }, [selectedProductIds, baggageOptions]);

  const selectedCount = selectedProductIds.size;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5" />
            </svg>
          </div>
          <span className="text-sm font-semibold">{t('addBaggageTitle')}</span>
        </div>
      }
      className="max-w-lg"
    >
      {/* Info bar */}
      <div className="flex items-center justify-between bg-zinc-50/80 -mx-6 -mt-2 px-6 py-2.5 border-b border-zinc-100 mb-4">
        <span className="text-[11px] text-zinc-500">{t('selectBaggageDesc')}</span>
        <span className="text-[11px] text-zinc-400 tabular-nums">{t('maxBags')}</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-teal mb-3" />
          <p className="text-sm font-medium text-zinc-500">{t('loadingBaggageOptions')}</p>
          <p className="text-[11px] text-zinc-400 mt-1">{t('fetchingBaggage')}</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 mb-3">
            <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          {includedBaggageLabel ? (
            <>
              <p className="text-sm font-medium text-zinc-700">{t('includedBaggageTitle')}</p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">{includedBaggageLabel}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{t('noPaidBaggageFare')}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-700">{t('unableLoadBaggage')}</p>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">{error}</p>
            </>
          )}
          <button type="button" onClick={onClose} className="mt-4 rounded-xl border border-zinc-200 px-4 py-2 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer">
            {tc('close')}
          </button>
        </div>
      )}

      {/* Empty — no paid options, no error */}
      {!loading && !error && baggageOptions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 mb-3">
            <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5" />
            </svg>
          </div>
          {includedBaggageLabel ? (
            <>
              <p className="text-sm font-medium text-zinc-700">{t('includedBaggageTitle')}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{includedBaggageLabel}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{t('noAdditionalBaggageFare')}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-700">{t('noBaggageOptionsTitle')}</p>
              <p className="text-[11px] text-zinc-400 mt-1">{t('noBaggageOffer')}</p>
            </>
          )}
          <button type="button" onClick={onClose} className="mt-4 rounded-xl border border-zinc-200 px-4 py-2 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer">
            {tc('close')}
          </button>
        </div>
      )}

      {/* Options list */}
      {!loading && !error && baggageOptions.length > 0 && (
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {baggageOptions.map((option) => {
            const isSelected = selectedProductIds.has(option.productId);
            return (
              <button
                key={option.productId}
                type="button"
                onClick={() => toggleOption(option)}
                className={`w-full flex items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-brand-teal/40 bg-brand-teal/[0.03] ring-1 ring-brand-teal/15"
                    : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-100/80"
                }`}
              >
                {/* Icon */}
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                    isSelected
                      ? "bg-brand-teal text-white shadow-sm shadow-brand-teal/20"
                      : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  <BaggageIconSvg type={option.icon} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-zinc-900">{option.label}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{option.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold tabular-nums text-zinc-800">
                        {formatPrice ? formatPrice(option.price, option.currency) : formatCurrency(option.price, option.currency)}
                      </p>
                      {isSelected && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-brand-teal mt-0.5">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {t('addedBadge')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100/80 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {option.weight}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100/80 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {option.maxSize}
                    </span>
                  </div>
                </div>

                {/* Checkbox */}
                <div
                  className={`flex h-5 w-5 shrink-0 mt-0.5 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                    isSelected
                      ? "border-brand-teal bg-brand-teal"
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
      {!loading && !error && baggageOptions.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-zinc-100 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-400 tabular-nums">
            {selectedCount > 0
              ? t('bagsSelectedCount', { count: selectedCount })
              : t('noBagsSelected')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
            >
              {tc('cancel')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={totalPrice <= 0}
              className={`rounded-xl px-5 py-2 text-[11px] font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                totalPrice <= 0
                  ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                  : "bg-brand-teal text-white hover:bg-[#012830] shadow-sm shadow-brand-teal/25"
              }`}
            >
              {totalPrice > 0 ? (
                <>
                  <span>{tc('done')}</span>
                  <span className="text-white/70">· {(() => {
                    const firstSelected = Array.from(selectedProductIds).map(pid => baggageOptions.find(b => b.productId === pid)).find(Boolean);
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
