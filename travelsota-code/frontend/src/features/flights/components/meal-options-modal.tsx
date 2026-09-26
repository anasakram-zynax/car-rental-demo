"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { encodeMeal, formatCurrency } from "@/features/flights/utils/ancillary-utils";


export interface MealOption {
  productId: string;
  mealName: string;
  mealCode: string;
  dietaryType: string;
  description: string;
  price: number;
  currency: string;
}

interface MealOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelerCount: number;
  existingMealIds: string[];
  onConfirm: (mealIds: string[]) => void;
  catalogMealOptions?: MealOption[];
  catalogMealsLoading?: boolean;
  catalogMealsError?: string;
  /** Currency formatter — converts supplier amount+currency to display currency */
  formatPrice?: (amount: number, sourceCurrency: string) => string;
}

export function MealOptionsModal({
  isOpen,
  onClose,
  travelerCount,
  existingMealIds,
  onConfirm,
  catalogMealOptions,
  catalogMealsLoading,
  catalogMealsError,
  formatPrice,
}: MealOptionsModalProps) {
  const mealOptions: MealOption[] = catalogMealOptions ?? [];
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const mealsLoading = catalogMealsLoading ?? false;
  const mealsError = catalogMealOptions && catalogMealOptions.length > 0
    ? undefined
    : (catalogMealsError ?? t('mealsUnavailableDefault'));

  const [selectedMeals, setSelectedMeals] = useState<string[]>(() =>
    Array.from({ length: travelerCount }, (_, i) => existingMealIds[i] ?? ''),
  );

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMeals(
        Array.from({ length: travelerCount }, (_, i) => existingMealIds[i] ?? ''),
      );
    }
  }, [isOpen, travelerCount]);

  const totalPrice = useMemo(() => {
    return selectedMeals.reduce((sum, id) => {
      const opt = mealOptions.find((m) => m.productId === id);
      return sum + (opt?.price ?? 0);
    }, 0);
  }, [selectedMeals, mealOptions]);

  const selectedCount = selectedMeals.filter(Boolean).length;

  function selectMeal(travelerIndex: number, productId: string) {
    setSelectedMeals((current) => {
      const next = [...current];
      next[travelerIndex] = next[travelerIndex] === productId ? '' : productId;
      return next;
    });
  }

  function clearMeal(travelerIndex: number) {
    setSelectedMeals((current) => {
      const next = [...current];
      next[travelerIndex] = '';
      return next;
    });
  }

  function handleConfirm() {
    const encoded = selectedMeals.map((id) => {
      if (!id) return '';
      const opt = mealOptions.find((m) => m.productId === id);
      if (!opt) return '';
      return encodeMeal({
        productId: opt.productId,
        mealName: opt.mealName,
        mealCode: opt.mealCode,
        dietaryType: opt.dietaryType,
        priceText: opt.price > 0 ? `${opt.price.toFixed(2)} ${opt.currency}` : '0.00 USD',
      });
    });
    onConfirm(encoded);
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12" />
            </svg>
          </div>
          <span className="text-sm font-semibold">{t('selectMeals')}</span>
        </div>
      }
      className="max-w-lg"
    >
      {/* Info bar */}
      <div className="flex items-center justify-between bg-zinc-50/80 -mx-6 -mt-2 px-6 py-2.5 border-b border-zinc-100 mb-4">
        <span className="text-[11px] text-zinc-500">{t('mealInfoBar')}</span>
        <span className="text-[11px] text-zinc-400 tabular-nums">{t('travelerCount', { count: travelerCount })}</span>
      </div>

      {/* Loading */}
      {mealsLoading && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-teal mb-3" />
          <p className="text-sm font-medium text-zinc-500">{t('loadingMeals')}</p>
          <p className="text-[11px] text-zinc-400 mt-1">{t('fetchingMeals')}</p>
        </div>
      )}

      {/* Error */}
      {!mealsLoading && mealsError && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 mb-3">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-700">{t('mealsUnavailableTitle')}</p>
          <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">{mealsError}</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-xl border border-zinc-200 px-4 py-2 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer">
            {tc('close')}
          </button>
        </div>
      )}

      {/* Empty */}
      {!mealsLoading && !mealsError && mealOptions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 mb-3">
            <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75v7.5m0 0H6m3.75 0h3.75M6 11.25V21m12.75-17.25v7.5m0 0H15m3.75 0h3.75M15 11.25V21" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-700">{t('noMealsTitle')}</p>
          <p className="text-[11px] text-zinc-400 mt-1">{t('noMealsDesc')}</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-xl border border-zinc-200 px-4 py-2 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition cursor-pointer">
            {tc('close')}
          </button>
        </div>
      )}

      {/* Traveler meal sections */}
      {!mealsLoading && !mealsError && mealOptions.length > 0 && (
        <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
          {Array.from({ length: travelerCount }, (_, travelerIndex) => {
            const currentMealId = selectedMeals[travelerIndex];
            const currentMeal = currentMealId ? mealOptions.find((m) => m.productId === currentMealId) : null;
            return (
              <div key={travelerIndex} className="rounded-2xl border border-zinc-200/80 overflow-hidden">
                {/* Traveler header */}
                <div className="flex items-center justify-between bg-zinc-50/80 px-4 py-2.5 border-b border-zinc-100">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white tabular-nums">
                      {travelerIndex + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-zinc-800">
                      {t('travelerTabLabel', { index: travelerIndex + 1 })}
                    </span>
                    {currentMeal && (
                      <span className="text-[11px] text-zinc-400">· {currentMeal.mealName}</span>
                    )}
                  </div>
                  {currentMealId && (
                    <button
                      type="button"
                      onClick={() => clearMeal(travelerIndex)}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
                      title={tc('clearSelection')}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Meal options */}
                <div className="p-3 space-y-1.5">
                  {mealOptions.map((meal) => {
                    const isSelected = selectedMeals[travelerIndex] === meal.productId;
                    return (
                      <button
                        key={`${travelerIndex}-${meal.productId}`}
                        type="button"
                        onClick={() => selectMeal(travelerIndex, meal.productId)}
                        className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'border-brand-teal/40 bg-brand-teal/[0.03] ring-1 ring-brand-teal/15'
                            : 'border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-sm'
                        }`}
                      >
                        {/* Dietary icon */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150 ${
                            isSelected ? 'bg-brand-teal text-white shadow-sm shadow-brand-teal/20' : 'bg-zinc-100 text-zinc-400'
                          }`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75v7.5m0 0H6m3.75 0h3.75M6 11.25V21m12.75-17.25v7.5m0 0H15m3.75 0h3.75M15 11.25V21" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-zinc-900">{meal.mealName}</p>
                            {meal.dietaryType !== 'Regular' && (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 border border-amber-100">
                                {meal.dietaryType}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{meal.description}</p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-bold tabular-nums text-zinc-800">
                            {meal.price > 0 ? (formatPrice ? formatPrice(meal.price, meal.currency) : formatCurrency(meal.price, meal.currency)) : t('freeLabel')}
                          </p>
                        </div>

                        <div
                          className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150 ${
                            isSelected ? 'border-brand-teal bg-brand-teal' : 'border-zinc-300'
                          }`}
                        >
                          {isSelected && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!mealsLoading && !mealsError && mealOptions.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-zinc-100 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-400 tabular-nums">
            {selectedCount > 0
              ? t('mealsSelected', { count: selectedCount })
              : t('noMealsSelected')}
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
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className={`rounded-xl px-5 py-2 text-[11px] font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                selectedCount === 0
                  ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                  : 'bg-brand-teal text-white hover:bg-[#012830] shadow-sm shadow-brand-teal/25'
              }`}
            >
              {totalPrice > 0 ? (
                <>
                  <span>{t('confirm')}</span>
                  <span className="text-white/70">· {(() => {
                    const firstSelected = selectedMeals.map(id => mealOptions.find(m => m.productId === id)).find(Boolean);
                    return formatPrice ? formatPrice(totalPrice, firstSelected?.currency ?? 'USD') : formatCurrency(totalPrice, firstSelected?.currency ?? 'USD');
                  })()}</span>
                </>
              ) : (
                t('confirm')
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
