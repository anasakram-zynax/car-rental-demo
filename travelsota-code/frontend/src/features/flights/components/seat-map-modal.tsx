"use client";

import React, { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { encodeSeat } from "@/features/flights/utils/ancillary-utils";
import type { ApiSeatData, SeatMapRowLayout, UnifiedSeatMap, UnifiedSeatElement } from "@/features/flights/api/ancillaries";
import { unifiedSeatsToApiData } from "@/features/flights/api/ancillaries";

/* ─── Props ─── */

interface SeatMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  flightLabel: string;
  travelerCount: number;
  existingSelections: string[];
  onConfirm: (encodedSeats: string[]) => void;
  apiSeatData?: ApiSeatData[];
  layout?: SeatMapRowLayout[];
  segmentMaps?: UnifiedSeatMap[];
  loading?: boolean;
  travelerNames?: string[];
  formatPrice?: (amount: number, currency: string) => string;
}

/* ─── Helpers ─── */

function getPosition(letter: string): "window" | "middle" | "aisle" {
  const upper = letter.toUpperCase();
  if (upper === "A" || upper === "F" || upper === "K") return "window";
  if (upper === "C" || upper === "D" || upper === "G" || upper === "H") return "aisle";
  return "middle";
}

function getSeatLabelKey(features: string[]): "" | "seatExit" | "seatBulkhead" | "seatLegroom" | "seatPremium" {
  const feat = features.map((f) => f.toLowerCase());
  if (feat.some((f) => f.includes("exit") || f.includes("emergency"))) return "seatExit";
  if (feat.some((f) => f.includes("bulkhead"))) return "seatBulkhead";
  if (feat.some((f) => f.includes("legroom"))) return "seatLegroom";
  if (feat.some((f) => f.includes("business") || f.includes("first"))) return "seatPremium";
  return "";
}

interface SeatSelection {
  seatNumber: string;
  row: number;
  letter: string;
  priceAmount: number;
  currency: string;
  productId?: string;
  features: string[];
  catalogOfferingsIdentifier?: string;
  catalogOfferingIdentifierValue?: string;
  segmentIndex: number;
}

type SelectionMap = Map<string, SeatSelection>;

/* ─── Animations ─── */

const container = { hidden: {}, show: { transition: { staggerChildren: 0.015 } } };
const rowAnim = { hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } };
const seatAnim = { hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } };
const fadeSlideUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };
const fadeSlideDown = { hidden: { opacity: 0, y: -8 }, show: { opacity: 1, y: 0 } };

/* ─── Sub-components ─── */

function ColumnHeaders({ groups, columns }: { groups: string[][]; columns: string[] }) {
  if (columns.length === 0) return null;
  return (
    <div className="flex justify-center gap-0 mb-2">
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="w-5" />}
          {group.map((letter) => (
            <motion.div
              key={letter}
              className="w-9 text-center"
              variants={fadeSlideDown}
              initial="hidden"
              animate="show"
              transition={{ delay: gi * 0.03 }}
            >
              <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest">{letter}</span>
            </motion.div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function SeatCell({
  element, rowNumber, letter, segmentIndex, passengerIndex, isSelected, isOccupied, onSelect, formatPrice,
}: {
  element: UnifiedSeatElement; rowNumber: number; letter: string; segmentIndex: number; passengerIndex: number;
  isSelected: boolean; isOccupied: boolean; onSelect: (sel: SeatSelection) => void;
  formatPrice?: (amount: number, currency: string) => string;
}) {
  const t = useTranslations("Flights");
  const price = element.pricing.supplierPrice.amount;
  const currency = element.pricing.supplierPrice.currency;
  const hasPrice = price > 0;
  const labelKey = getSeatLabelKey(element.features);
  const label = labelKey ? t(labelKey) : "";
  const position = getPosition(letter);
  const isDisabled = !element.available || isOccupied;

  let baseClasses = "";
  if (isSelected) {
    baseClasses = "bg-indigo-600 ring-indigo-600 text-white shadow-lg shadow-indigo-200";
  } else if (isOccupied) {
    baseClasses = "bg-zinc-100 ring-zinc-200 text-zinc-300 cursor-not-allowed";
  } else if (!element.available) {
    baseClasses = "bg-zinc-50 ring-zinc-100 text-zinc-300 cursor-not-allowed";
  } else if (labelKey === "seatLegroom" || labelKey === "seatBulkhead" || labelKey === "seatExit") {
    baseClasses = "bg-amber-50 ring-amber-200 text-amber-800 hover:bg-amber-100 hover:ring-amber-400";
  } else if (position === "window") {
    baseClasses = "bg-sky-50 ring-sky-200 text-sky-800 hover:bg-sky-100 hover:ring-sky-400";
  } else if (position === "aisle") {
    baseClasses = "bg-emerald-50 ring-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:ring-emerald-400";
  } else {
    baseClasses = "bg-white ring-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:ring-zinc-400";
  }

  return (
    <motion.button
      type="button"
      disabled={isDisabled}
      onClick={() => !isDisabled && onSelect({
        seatNumber: element.seatNumber, row: rowNumber, letter,
        priceAmount: price, currency,
        productId: element.supplierRef?.raw?.ancillaryProductId as string | undefined,
        features: element.features ?? [],
        catalogOfferingsIdentifier: element.supplierRef?.raw?.catalogOfferingsIdentifier as string | undefined,
        catalogOfferingIdentifierValue: element.supplierRef?.raw?.catalogOfferingIdentifierValue as string | undefined,
        segmentIndex,
      })}
      title={
        hasPrice
          ? t("seatTooltipPriced", { seat: `${rowNumber}${letter}`, detail: label ? ` · ${label}` : "", price: formatPrice ? formatPrice(price, currency) : `${price} ${currency}` })
          : isDisabled
            ? t("seatTooltipUnavailable", { seat: `${rowNumber}${letter}`, detail: label ? ` · ${label}` : "" })
            : t("seatTooltipIncluded", { seat: `${rowNumber}${letter}`, detail: label ? ` · ${label}` : "" })
      }
      variants={seatAnim}
      whileHover={isDisabled ? {} : { scale: 1.15, y: -3, zIndex: 20 }}
      whileTap={isDisabled ? {} : { scale: 0.85 }}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 text-[10px] font-semibold transition-colors duration-150 cursor-pointer ${baseClasses} ${isSelected ? "scale-110 z-10" : ""}`}
    >
      {letter}
      {hasPrice && !isSelected && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-0.5 text-[7px] font-bold text-amber-900 leading-none shadow-sm"
        >
          $
        </motion.span>
      )}
      {isSelected && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -inset-0.5 rounded-lg ring-2 ring-indigo-300 ring-offset-1"
        />
      )}
    </motion.button>
  );
}

/* ─── Main Component ─── */

export function SeatMapModal({
  isOpen, onClose, flightLabel, travelerCount, existingSelections, onConfirm,
  apiSeatData: legacyApiSeatData, layout: legacyLayout, segmentMaps, loading, travelerNames, formatPrice: formatPriceProp,
}: SeatMapModalProps) {
  const t = useTranslations("Flights");
  const tc = useTranslations("Common");
  const { apiSeatData, layout } = useMemo(() => {
    if (legacyApiSeatData && legacyLayout) return { apiSeatData: legacyApiSeatData, layout: legacyLayout };
    if (segmentMaps && segmentMaps.length > 0) return unifiedSeatsToApiData(segmentMaps);
    return { apiSeatData: [], layout: [] };
  }, [segmentMaps, legacyApiSeatData, legacyLayout]);

  const segments = segmentMaps ?? [];

  const [activeSegment, setActiveSegment] = useState(0);
  const [activePassenger, setActivePassenger] = useState(0);
  const [selections, setSelections] = useState<SelectionMap>(() => {
    const map: SelectionMap = new Map();
    for (const encoded of existingSelections) {
      try {
        if (!encoded.startsWith("seat:")) continue;
        const decoded = JSON.parse(decodeURIComponent(encoded.slice(5)));
        if (!decoded.seat || !decoded.segmentId) continue;
        const segIdx = segments.findIndex((s) => s.segmentId === decoded.segmentId);
        if (segIdx === -1) continue;
        const paxIdx = decoded.passengerIndex ?? 0;
        map.set(`${segIdx}:${paxIdx}:${decoded.seat}`, {
          seatNumber: decoded.seat,
          row: parseInt(String(decoded.seat).match(/^\d+/)?.[0] ?? "0"),
          letter: String(decoded.seat).replace(/^\d+/, ""),
          priceAmount: decoded.priceAmount ?? 0, currency: decoded.currency ?? "USD",
          productId: decoded.ancillaryProductId, features: [],
          catalogOfferingsIdentifier: decoded.catalogOfferingsIdentifier,
          catalogOfferingIdentifierValue: decoded.catalogOfferingIdentifierValue,
          segmentIndex: segIdx,
        });
      } catch { /* skip */ }
    }
    return map;
  });

  const hasMultipleSegments = segments.length > 1;
  const hasMultiplePassengers = travelerCount > 1;
  const currentSegment = segments[activeSegment];

  const occupiedInSegment = new Set<string>();
  for (const [key, sel] of selections) {
    const [seg, pax] = key.split(":").map(Number);
    if (seg === activeSegment && pax !== activePassenger) occupiedInSegment.add(sel.seatNumber);
  }

  const currentSelectionKey = `${activeSegment}:${activePassenger}`;
  const selectedSeatNumbers = new Set<string>();
  for (const [key, sel] of selections) {
    if (key.startsWith(`${currentSelectionKey}:`)) selectedSeatNumbers.add(sel.seatNumber);
  }

  const activeSeats = useMemo(() => {
    if (!segmentMaps || segmentMaps.length === 0) return apiSeatData;
    const active = segmentMaps[activeSegment];
    if (!active) return [];
    const result: ApiSeatData[] = [];
    for (const cabin of active.cabins ?? []) {
      for (const row of cabin.rows ?? []) {
        for (const el of row.elements ?? []) {
          if (el.type !== "seat" || !el.seatNumber) continue;
          const letter = el.column ?? el.seatNumber.replace(/^\d+/, "");
          result.push({
            row: row.rowNumber, letter, seatNumber: el.seatNumber,
            position: getPosition(letter),
            priceAmount: el.pricing.supplierPrice.amount,
            currency: el.pricing.supplierPrice.currency,
            available: el.available, features: el.features ?? [],
            productId: (el.supplierRef?.raw?.ancillaryProductId ?? el.supplierRef?.raw?.productIdentifier) as string | undefined,
            catalogOfferingsIdentifier: currentSegment?.segmentId,
            catalogOfferingIdentifierValue: el.supplierRef?.raw?.catalogOfferingIdentifierValue as string | undefined,
          });
        }
      }
    }
    return result;
  }, [segmentMaps, activeSegment, apiSeatData, currentSegment]);

  const totalSelected = selections.size;
  const totalPrice = Array.from(selections.values()).reduce((sum, s) => sum + s.priceAmount, 0);
  const displayCurrency = selections.size > 0 ? Array.from(selections.values())[0].currency : "USD";

  const activeLayout = useMemo(() => {
    if (segmentMaps && segmentMaps.length > 0 && segments.length > 0) {
      const rowSet = new Map<number, Set<string>>();
      for (const seat of activeSeats) {
        if (!rowSet.has(seat.row)) rowSet.set(seat.row, new Set());
        rowSet.get(seat.row)!.add(seat.letter);
      }
      return Array.from(rowSet.entries()).sort(([a], [b]) => a - b).map(([rowNumber, colSet]) => {
        const columns = Array.from(colSet).sort();
        const groups: string[][] = [];
        let cur: string[] = [columns[0]];
        for (let i = 1; i < columns.length; i++) {
          if (columns[i].charCodeAt(0) - columns[i - 1].charCodeAt(0) === 1) { cur.push(columns[i]); }
          else { groups.push(cur); cur = [columns[i]]; }
        }
        groups.push(cur);
        return { rowNumber, columns, groups };
      });
    }
    return layout;
  }, [segmentMaps, segments, activeSeats, layout]);

  const cabinBoundaries = useMemo(() => {
    if (!currentSegment) return [];
    const boundaries: Array<{ row: number; label: string }> = [];
    let prevBrand = "";
    for (const cabin of currentSegment.cabins ?? []) {
      const firstRow = cabin.rows?.[0]?.rowNumber;
      if (firstRow && cabin.cabinClass !== prevBrand) {
        boundaries.push({ row: firstRow, label: cabin.cabinClass });
        prevBrand = cabin.cabinClass;
      }
    }
    return boundaries;
  }, [currentSegment]);

  const handleSeatSelect = useCallback((sel: SeatSelection) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const key = `${activeSegment}:${activePassenger}:${sel.seatNumber}`;
      if (next.has(key)) { next.delete(key); }
      else {
        for (const [k] of next) { if (k.startsWith(`${activeSegment}:${activePassenger}:`)) next.delete(k); }
        sel.segmentIndex = activeSegment;
        next.set(key, sel);
      }
      return next;
    });
  }, [activeSegment, activePassenger]);

  const fmtPrice = formatPriceProp ?? ((amount: number, currency: string) => `${amount} ${currency}`);

  const handleConfirm = useCallback(() => {
    const encoded: string[] = [];
    for (const sel of selections.values()) {
      encoded.push(encodeSeat({
        seat: sel.seatNumber, flightLabel, brand: "",
        priceText: `${sel.priceAmount} ${sel.currency}`,
        ancillaryProductId: sel.productId,
        catalogOfferingsIdentifier: sel.catalogOfferingsIdentifier,
        catalogOfferingIdentifierValue: sel.catalogOfferingIdentifierValue,
        passengerIndex: activePassenger, segmentIndex: sel.segmentIndex,
        segmentId: segments[sel.segmentIndex]?.segmentId,
      }));
    }
    onConfirm(encoded);
  }, [selections, flightLabel, onConfirm, activePassenger, segments, fmtPrice]);

  const segmentLabel = (idx: number) => {
    if (segments.length === 2) return idx === 0 ? t("outbound") : t("inbound");
    return t("flightSegmentLabel", { index: idx + 1 });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false} className="w-full max-w-4xl">
      <div className="flex flex-col h-[82vh] max-h-[680px] bg-white">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 shrink-0"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
              <svg className="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-zinc-800">{flightLabel}</span>
            {loading && <span className="text-[10px] text-zinc-400">{tc('loading')}</span>}
            {!loading && activeSeats.length > 0 && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{t('seatLive')}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </motion.div>

        {/* Loading State */}
        <AnimatePresence>
          {loading && (
            <motion.div className="flex-1 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  className="h-10 w-10 rounded-full border-2 border-zinc-200 border-t-indigo-500"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                />
                <span className="text-xs text-zinc-400">{t('loadingSeatMap')}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!loading && segments.length === 0 && activeSeats.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500">{t('seatMapUnavailableTitle')}</p>
              <p className="text-xs text-zinc-400">{t('seatMapUnavailableDesc')}</p>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && (segments.length > 0 || activeSeats.length > 0) && (
          <div className="flex flex-1 min-h-0">
            {/* Segment Sidebar */}
            {hasMultipleSegments && (
              <div className="w-36 shrink-0 border-r border-zinc-100 bg-gradient-to-b from-zinc-50/50 to-white flex flex-col p-2.5 gap-1 overflow-y-auto">
                {segments.map((seg, idx) => (
                  <button
                    key={seg.segmentId}
                    onClick={() => setActiveSegment(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200
                      ${activeSegment === idx
                        ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800"
                      }`}
                  >
                    <span className="block truncate">{segmentLabel(idx)}</span>
                    <span className="block text-[10px] opacity-70 mt-0.5">{seg.cabinClass}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 flex flex-col min-w-0">
              {/* Passenger Tabs */}
              {hasMultiplePassengers && (
                <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-zinc-50 shrink-0 overflow-x-auto">
                  {Array.from({ length: travelerCount }, (_, i) => {
                    const hasSelection = Array.from(selections.keys()).some((k) => k.startsWith(`${activeSegment}:${i}:`));
                    return (
                      <motion.button
                        key={i}
                        onClick={() => setActivePassenger(i)}
                        whileTap={{ scale: 0.95 }}
                        className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                          ${activePassenger === i
                            ? "bg-zinc-900 text-white shadow-sm"
                            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
                          }`}
                      >
                        {travelerNames?.[i] ?? t('travelerTabLabel', { index: i + 1 })}
                        {hasSelection && (
                          <span className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 text-[8px] font-bold text-white">✓</span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Seat Grid */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="flex flex-col items-center min-w-fit">
                  {activeLayout.length > 0 && (
                    <ColumnHeaders groups={activeLayout[0].groups} columns={activeLayout[0].columns} />
                  )}

                  <motion.div className="flex flex-col items-center" variants={container} initial="hidden" animate="show">
                    {activeLayout.map((rowLayout) => {
                      const rowNum = rowLayout.rowNumber;
                      const boundary = cabinBoundaries.find((b) => b.row === rowNum);
                      const isExitRow = activeSeats.some((s) =>
                        s.row === rowNum && s.features.some((f) => f.toLowerCase().includes("exit"))
                      );

                      return (
                        <React.Fragment key={rowNum}>
                          {/* Cabin Section Header */}
                          {boundary && (
                            <motion.div
                              className="mb-3 mt-5 w-full max-w-md flex items-center gap-3"
                              variants={fadeSlideUp}
                            >
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
                              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400 whitespace-nowrap px-2 py-0.5 rounded bg-zinc-50">
                                {boundary.label}
                              </span>
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
                            </motion.div>
                          )}

                          {/* Exit Row */}
                          {isExitRow && (
                            <motion.div className="mb-1.5 w-full max-w-md flex items-center gap-2" variants={fadeSlideUp}>
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 whitespace-nowrap">{t('seatExitRow')}</span>
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
                            </motion.div>
                          )}

                          {/* Row */}
                          <motion.div className="flex items-center gap-2 group/row" variants={rowAnim}>
                            <span className="w-7 text-right text-[10px] font-semibold text-zinc-400 tabular-nums">
                              {rowNum}
                            </span>

                            <div className="flex gap-1.5">
                              {rowLayout.groups.map((group, gi) => (
                                <React.Fragment key={gi}>
                                  {gi > 0 && <div className="w-4" />}
                                  {group.map((letter) => {
                                    const seatNum = `${rowNum}${letter}`;
                                    const element = activeSeats.find((s) => s.row === rowNum && s.letter === letter);
                                    const isSelected = selectedSeatNumbers.has(seatNum);
                                    const isOccupied = occupiedInSegment.has(seatNum);

                                    if (!element) {
                                      return (
                                        <div key={seatNum} className="w-9 h-9 flex items-center justify-center">
                                          <span className="text-[9px] text-zinc-200">·</span>
                                        </div>
                                      );
                                    }

                                    const unified: UnifiedSeatElement = {
                                      type: "seat", seatNumber: element.seatNumber, column: element.letter,
                                      available: element.available, features: element.features,
                                      pricing: { supplierPrice: { amount: element.priceAmount, currency: element.currency } },
                                      supplierRef: {
                                        provider: "travelport",
                                        raw: { ancillaryProductId: element.productId, catalogOfferingsIdentifier: element.catalogOfferingsIdentifier, catalogOfferingIdentifierValue: element.catalogOfferingIdentifierValue },
                                      },
                                    };

                                    return (
                                      <SeatCell key={seatNum} element={unified} rowNumber={rowNum} letter={letter}
                                        segmentIndex={activeSegment} passengerIndex={activePassenger}
                                        isSelected={isSelected} isOccupied={isOccupied}
                                        onSelect={handleSeatSelect} formatPrice={formatPriceProp}
                                      />
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </div>

                            <span className="w-7 text-left text-[10px] font-semibold text-zinc-400 tabular-nums">
                              {rowNum}
                            </span>
                          </motion.div>
                        </React.Fragment>
                      );
                    })}
                  </motion.div>
                </div>
              </div>

              {/* Footer */}
              <motion.div
                className="shrink-0 border-t border-zinc-100 bg-white px-5 py-3.5 space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex flex-wrap items-center gap-5 text-[10px]">
                  <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-lg border border-zinc-300 bg-white" /><span className="text-zinc-500">{tc('available')}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-lg bg-indigo-600" /><span className="text-zinc-500">{tc('selected')}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-lg bg-zinc-100 border border-zinc-200" /><span className="text-zinc-500">{tc('occupied')}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-[8px] text-zinc-300">×</div><span className="text-zinc-500">{tc('unavailable')}</span></div>
                  <div className="flex items-center gap-1.5"><div className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-0.5 text-[7px] font-bold text-amber-900 leading-none">$</div><span className="text-zinc-500">{tc('paidLabel')}</span></div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-zinc-600">{t('seatsSelectedCount', { count: totalSelected })}</span>
                    <AnimatePresence mode="wait">
                      {totalPrice > 0 && (
                        <motion.span
                          key={totalPrice}
                          className="ml-2 text-xs font-bold text-indigo-600"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                        >
                          +{fmtPrice(totalPrice, displayCurrency)}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700 rounded-xl hover:bg-zinc-100 transition-all">
                      {tc('cancel')}
                    </button>
                    <motion.button
                      type="button" onClick={handleConfirm}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-700 hover:to-indigo-800 shadow-sm shadow-indigo-200 transition-all"
                    >
                      {tc('confirmSelection')}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
