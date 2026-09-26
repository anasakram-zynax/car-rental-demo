'use client';
import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth } from '@/components/auth/require-auth';
import { useCurrency, useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { getBooking } from '@/features/flights/api/get-booking';
import {
  getExtrasCatalog,
  confirmExtras,
  getExtrasStatus,
  type ExtrasCatalogItem,
  type ExtrasCatalogResponse,
  type ExtrasConfirmResponse,
  type ExtrasStatusResponse,
  type ConfirmSelection,
} from '@/features/flights/api/booking-extras';

const MEAL_SSR_CODES = [
  { code: 'VGML', name: 'Vegan Meal', dietary: 'Vegan' },
  { code: 'AVML', name: 'Asian Vegetarian Meal', dietary: 'Vegetarian' },
  { code: 'HNML', name: 'Hindu Meal', dietary: 'Hindu' },
  { code: 'KSML', name: 'Kosher Meal', dietary: 'Kosher' },
  { code: 'MOML', name: 'Muslim Meal', dietary: 'Halal' },
  { code: 'CHML', name: 'Child Meal', dietary: 'Child' },
  { code: 'BBML', name: 'Baby Meal', dietary: 'Baby' },
];

type Step = 'catalog' | 'review' | 'confirming' | 'done';

export default function ManageExtrasPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const t = useTranslations('Checkout');
  const tb = useTranslations('Booking');
  const [bookingId, setBookingId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingLocator, setBookingLocator] = useState<string | null>(null);

  // Catalog state
  const [catalog, setCatalog] = useState<ExtrasCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Selection state
  const [selectedSeats, setSelectedSeats] = useState<Map<string, ExtrasCatalogItem>>(new Map());
  const [selectedBaggage, setSelectedBaggage] = useState<Map<string, ExtrasCatalogItem>>(new Map());
  const [selectedMeals, setSelectedMeals] = useState<Map<string, ExtrasCatalogItem>>(new Map());

  // Flow state
  const [step, setStep] = useState<Step>('catalog');
  const [confirmResult, setConfirmResult] = useState<ExtrasConfirmResponse | null>(null);
  const [extrasStatus, setExtrasStatus] = useState<ExtrasStatusResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Init booking
  useEffect(() => {
    params.then(({ bookingId: id }) => setBookingId(id));
  }, [params]);

  // Load booking and catalog
  useEffect(() => {
    if (!bookingId) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const booking = await getBooking(bookingId);
        if (!mounted) return;
        if (!booking.locatorCode) {
          setError(t('bookingNotConfirmedYet'));
          setLoading(false);
          return;
        }
        setBookingLocator(booking.locatorCode);

        // Fetch extras catalog
        setCatalogLoading(true);
        const cat = await getExtrasCatalog(bookingId);
        if (!mounted) return;
        setCatalog(cat);
      } catch (err: any) {
        if (mounted) {
          setError(err?.message ?? t('failedLoadExtras'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setCatalogLoading(false);
        }
      }
    }

    load();
    return () => { mounted = false; };
  }, [bookingId, t]);

  // Separate catalog items by type
  const seatOptions = useMemo(
    () => catalog?.items.filter((i) => i.type === 'seat') ?? [],
    [catalog],
  );
  const baggageOptions = useMemo(
    () => catalog?.items.filter((i) => i.type === 'baggage') ?? [],
    [catalog],
  );
  const mealOptions = useMemo(
    () => catalog?.items.filter((i) => i.type === 'meal') ?? [],
    [catalog],
  );

  // Selection handlers
  const toggleSeat = useCallback((item: ExtrasCatalogItem) => {
    setSelectedSeats((prev) => {
      const next = new Map(prev);
      const key = item.ancillaryProductId;
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }, []);

  const toggleBaggage = useCallback((item: ExtrasCatalogItem) => {
    setSelectedBaggage((prev) => {
      const next = new Map(prev);
      const key = item.ancillaryProductId;
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }, []);

  const selectMeal = useCallback((item: ExtrasCatalogItem) => {
    setSelectedMeals((prev) => {
      const next = new Map(prev);
      next.set(item.mealCode ?? item.ancillaryProductId, item);
      return next;
    });
  }, []);

  const removeMeal = useCallback((code: string) => {
    setSelectedMeals((prev) => {
      const next = new Map(prev);
      next.delete(code);
      return next;
    });
  }, []);

  // Selection counts
  const seatCount = selectedSeats.size;
  const baggageCount = selectedBaggage.size;
  const mealCount = selectedMeals.size;
  const { convertAmount, selectedCurrency } = useCurrency();
  const { decimalsMap } = useCurrencyData();
  // Extras can price in different currencies — convert each into the selected
  // display currency BEFORE summing (previously summed raw and labeled USD).
  // Computed inline (a handful of items) rather than memoized.
  const totalCost = (() => {
    let total = 0;
    for (const item of selectedSeats.values()) {
      const amt = item.price?.amount ?? 0;
      const cur = (item.price?.currency ?? selectedCurrency.code).toUpperCase();
      total += cur === selectedCurrency.code ? amt : convertAmount(amt, cur);
    }
    for (const item of selectedBaggage.values()) {
      const amt = item.price?.amount ?? 0;
      const cur = (item.price?.currency ?? selectedCurrency.code).toUpperCase();
      total += cur === selectedCurrency.code ? amt : convertAmount(amt, cur);
    }
    return total;
  })();

  // Confirm extras
  const handleConfirm = useCallback(async () => {
    if (!bookingId) return;
    setSubmitting(true);
    setError(null);
    try {
      const items: ConfirmSelection[] = [
        ...Array.from(selectedSeats.values()).map((s) => ({
          ancillaryProductId: s.ancillaryProductId,
          type: 'seat' as const,
          label: `Seat ${s.seatNumber ?? s.label}`,
          travelerRef: s.travelerRef,
          segmentRef: s.segmentRef,
          seatNumber: s.seatNumber,
          catalogOfferingsIdentifier: s.catalogOfferingsIdentifier,
          catalogOfferingIdentifier: s.catalogOfferingIdentifier,
          price: s.price,
        })),
        ...Array.from(selectedBaggage.values()).map((b) => ({
          ancillaryProductId: b.ancillaryProductId,
          type: 'baggage' as const,
          label: b.label,
          travelerRef: b.travelerRef,
          segmentRef: b.segmentRef,
          catalogOfferingsIdentifier: b.catalogOfferingsIdentifier,
          catalogOfferingIdentifier: b.catalogOfferingIdentifier,
          price: b.price,
        })),
        ...Array.from(selectedMeals.values()).map((m) => ({
          ancillaryProductId: m.mealCode ?? m.ancillaryProductId,
          type: 'meal' as const,
          label: m.label,
          travelerRef: m.travelerRef,
          segmentRef: m.segmentRef,
          mealCode: m.mealCode,
          price: { amount: 0, currency: 'USD' },
        })),
      ];

      if (items.length === 0) {
        setError(t('selectAtLeastOne'));
        setSubmitting(false);
        return;
      }

      setStep('confirming');
      const result = await confirmExtras(bookingId, items);
      setConfirmResult(result);

      if (result.ok || result.status === 'partial') {
        setSuccessMessage(
          result.message ?? t('extrasAddedSuccess', { count: result.committedItems }),
        );
        // Refresh status
        const status = await getExtrasStatus(bookingId);
        setExtrasStatus(status);
        setStep('done');
      } else {
        setError(result.message ?? t('failedConfirmExtras'));
        setStep('catalog');
      }
    } catch (err: any) {
      setError(err?.message ?? t('failedConfirmExtras'));
      setStep('catalog');
    } finally {
      setSubmitting(false);
    }
  }, [bookingId, selectedSeats, selectedBaggage, selectedMeals, t]);

  // Format price with the amount's own currency and real decimals
  const fmtPrice = (amount: number, currency: string) => {
    if (amount <= 0) return tb('free');
    return formatCurrencyWithCode(amount, currency, decimalsMap);
  };

  if (loading) {
    return (
      <AppShell>
        <RequireAuth>
          <div className="mx-auto max-w-3xl px-4 py-12">
            <p className="text-sm text-zinc-500">{t('loadingBookingStatus')}</p>
          </div>
        </RequireAuth>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-zinc-900">{t('manageExtrasTitle')}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {t('bookingPrefix')} <span className="font-mono">{bookingId.slice(0, 8)}...</span>
              {bookingLocator && (
                <span className="ml-3">
                  {t('pnrPrefix')} <span className="font-mono font-medium text-zinc-700">{bookingLocator}</span>
                </span>
              )}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          {/* Catalog Loading */}
          {catalogLoading && (
            <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              {t('loadingExtrasStatus')}
            </div>
          )}

          {/* No catalog / fallback */}
          {!catalogLoading && catalog?.items.length === 0 && !error && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-700">
              <p className="font-medium">{t('noExtrasTitle')}</p>
              <p className="mt-1 text-amber-600">
                {t('noExtrasDesc')}
              </p>
            </div>
          )}

          {/* Done state */}
          {step === 'done' && confirmResult && (
            <div className="space-y-6">
              <div className="rounded-lg border border-zinc-200 bg-white p-6">
                <h2 className="text-lg font-medium text-zinc-900">{t('confirmationResultTitle')}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{confirmResult.committedItems}</p>
                    <p className="text-xs text-emerald-700">{t('addedLabel')}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-center">
                    <p className="text-2xl font-bold text-zinc-600">{confirmResult.failedItems}</p>
                    <p className="text-xs text-zinc-600">{t('failedLabel')}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-center">
                    <p className="text-lg font-semibold text-zinc-600">{confirmResult.status}</p>
                    <p className="text-xs text-zinc-600">{t('status')}</p>
                  </div>
                </div>
                {confirmResult.locatorCode && (
                  <p className="mt-4 text-sm text-zinc-600">
                    {t('updatedPnrLabel')} <span className="font-mono font-medium">{confirmResult.locatorCode}</span>
                  </p>
                )}
                {confirmResult.failures.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-red-600">{t('failuresTitle')}</p>
                    <ul className="mt-2 space-y-1">
                      {confirmResult.failures.map((f, i) => (
                        <li key={i} className="text-xs text-red-500">
                          {f.ancillaryProductId}: {f.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {extrasStatus && (
                <div className="rounded-lg border border-zinc-200 bg-white p-6">
                  <h2 className="text-lg font-medium text-zinc-900">{t('extrasStatusTitle')}</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t('overallPrefix')} <span className="font-medium">{extrasStatus.extrasStatus}</span>
                  </p>
                  <div className="mt-4 space-y-2">
                    {extrasStatus.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
                      >
                        <span>{item.label ?? item.type}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main catalog + selection UI */}
          {step !== 'done' && !catalogLoading && (
            <div className="space-y-8">
              {/* Seats Section */}
              {seatOptions.length > 0 && (
                <section className="rounded-lg border border-zinc-200 bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-medium text-zinc-900">{tb('seats')}</h2>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                      {tb('selectedCount', { n: seatCount })}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {seatOptions.map((seat) => {
                      const selected = selectedSeats.has(seat.ancillaryProductId);
                      return (
                        <button
                          key={seat.ancillaryProductId}
                          onClick={() => toggleSeat(seat)}
                          className={`rounded-lg border p-3 text-left text-sm transition-all ${
                            selected
                              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-zinc-900">
                              {seat.seatNumber ?? seat.label}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {fmtPrice(seat.price?.amount ?? 0, seat.price?.currency ?? 'USD')}
                            </span>
                          </div>
                          {seat.description && (
                            <p className="mt-1 text-xs text-zinc-500">{seat.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Baggage Section */}
              {baggageOptions.length > 0 && (
                <section className="rounded-lg border border-zinc-200 bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-medium text-zinc-900">{tb('baggage')}</h2>
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                      {tb('selectedCount', { n: baggageCount })}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {baggageOptions.map((bag) => {
                      const selected = selectedBaggage.has(bag.ancillaryProductId);
                      return (
                        <button
                          key={bag.ancillaryProductId}
                          onClick={() => toggleBaggage(bag)}
                          className={`rounded-lg border p-3 text-left text-sm transition-all ${
                            selected
                              ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400'
                              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-zinc-900">{bag.label}</span>
                              {bag.weight && (
                                <span className="ml-2 text-xs text-zinc-500">{bag.weight}</span>
                              )}
                              {bag.pieces && (
                                <span className="ml-1 text-xs text-zinc-500">
                                  x{bag.pieces}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-zinc-500">
                              {fmtPrice(bag.price?.amount ?? 0, bag.price?.currency ?? 'USD')}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Meal SSR Section */}
              <section className="rounded-lg border border-zinc-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-zinc-900">{t('mealRequestsTitle')}</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {t('mealRequestsDesc')}
                    </p>
                  </div>
                  <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-600">
                    {tb('selectedCount', { n: mealCount })}
                  </span>
                </div>

                {/* Selected meals */}
                {selectedMeals.size > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-medium text-zinc-600">{t('selectedMealsLabel')}</p>
                    {Array.from(selectedMeals.values()).map((meal) => (
                      <div
                        key={meal.mealCode}
                        className="flex items-center justify-between rounded border border-purple-200 bg-purple-50 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{meal.label}</span>
                          <span className="ml-2 text-xs text-zinc-500">
                            ({meal.mealCode})
                          </span>
                        </span>
                        <button
                          onClick={() => removeMeal(meal.mealCode ?? '')}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          {t('removeAction')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* SSR code selection */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {MEAL_SSR_CODES.map((ssr) => {
                    const selected = selectedMeals.has(ssr.code);
                    return (
                      <button
                        key={ssr.code}
                        onClick={() => {
                          if (selected) {
                            removeMeal(ssr.code);
                          } else {
                            selectMeal({
                              type: 'meal',
                              ancillaryProductId: ssr.code,
                              label: ssr.name,
                              mealCode: ssr.code,
                              dietaryType: ssr.dietary,
                              price: { amount: 0, currency: 'USD' },
                            });
                          }
                        }}
                        className={`rounded-lg border p-3 text-left text-sm transition-all ${
                          selected
                            ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-400'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        <div className="font-medium text-zinc-900">{tb(`mealName${ssr.code}`)}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">{ssr.code}</div>
                        <div className="text-xs text-emerald-600">{tb('free')}</div>
                      </button>
                    );
                  })}
                </div>

                {mealOptions.length > 0 && (
                  <>
                    <p className="mt-4 mb-2 text-xs font-medium text-zinc-600">
                      {t('availableAddOns')}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {mealOptions.map((meal) => {
                        const key = meal.mealCode ?? meal.ancillaryProductId;
                        const selected = selectedMeals.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (selected) removeMeal(key);
                              else selectMeal(meal);
                            }}
                            className={`rounded-lg border p-3 text-left text-sm transition-all ${
                              selected
                                ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-400'
                                : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                            }`}
                          >
                            <div className="font-medium text-zinc-900">{meal.label}</div>
                            <div className="text-xs text-emerald-600">{t('freeSsrLabel')}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              {/* Summary + Confirm */}
              <div className="sticky bottom-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-600">
                    {t('selectedItemsCount', { count: seatCount + baggageCount + mealCount })}
                    {totalCost > 0 && (
                      <span className="ml-2">
                        {t('totalPrefix')}{' '}
                        <span className="font-medium text-zinc-900">
                          {fmtPrice(totalCost, selectedCurrency.code)}
                        </span>
                      </span>
                    )}
                    {totalCost === 0 && seatCount + baggageCount + mealCount > 0 && (
                      <span className="ml-2">{t('allFreeLabel')}</span>
                    )}
                  </div>
                  <button
                    onClick={handleConfirm}
                    disabled={submitting || seatCount + baggageCount + mealCount === 0}
                    className="rounded-lg bg-brand-teal px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#012830] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? t('confirmingAction') : t('confirmExtrasAction')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Back link */}
          <div className="mt-8">
            <a
              href={`/booking/${bookingId}`}
              className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
            >
              {t('backToBookingDetails')}
            </a>
          </div>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
