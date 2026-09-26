'use client';

// Create Flight modal — wizard shell redesigned: responsive stepper (numbers
// only on phones), 44px touch-friendly inputs, ESC/overlay close with body
// scroll lock, keyboard-accessible airport/airline autocomplete. All form
// logic and the submit payload are unchanged from v1.

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Plane, Search, Loader2 } from 'lucide-react';
import { createManualFlight, searchAirports, searchAirlines, type CreateManualFlightInput, type AirportRef, type AirlineRef } from '@/features/admin/api/admin-manual-flights';

const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const;
const STEPS = ['Route', 'Airline', 'Pricing', 'Amenities'] as const;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR'];

const inputCls =
  'h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';
const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

interface Props { open: boolean; onClose: () => void; onCreated: () => void; }

export function CreateFlightModal({ open, onClose, onCreated }: Props) {
  const toasts = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [route, setRoute] = useState({ originId: '', destinationId: '', originCity: '', destinationCity: '', departureDate: '', departureTime: '08:00', arrivalTime: '10:30', duration: '' });
  const [airline, setAirline] = useState({ airlineId: '', airlineName: '', flightNumber: '' });
  const [pricing, setPricing] = useState({ basePrice: '', currency: 'USD', cabinClass: 'economy' as string, childPricePercent: '75', infantPricePercent: '10', refundable: false, availableSeats: '50', totalSeats: '50' });
  const [amenity, setAmenity] = useState({ hasWifi: false, hasMeal: false, hasEntertainment: false, hasPowerOutlet: false, checkedBaggage: '', cabinBaggage: '' });
  const [featured, setFeatured] = useState(false);

  const [originQ, setOriginQ] = useState(''); const [destQ, setDestQ] = useState(''); const [airlineQ, setAirlineQ] = useState('');
  const [originRes, setOriginRes] = useState<AirportRef[]>([]); const [destRes, setDestRes] = useState<AirportRef[]>([]); const [airlineRes, setAirlineRes] = useState<AirlineRef[]>([]);
  const [originOpen, setOriginOpen] = useState(false); const [destOpen, setDestOpen] = useState(false); const [airlineOpen, setAirlineOpen] = useState(false);
  const [originLoading, setOriginLoading] = useState(false); const [destLoading, setDestLoading] = useState(false); const [airlineLoading, setAirlineLoading] = useState(false);

  useEffect(() => {
    if (!originQ || !originOpen) return;
    const t = setTimeout(() => {
      setOriginLoading(true);
      searchAirports(originQ).then(setOriginRes).catch(() => {}).finally(() => setOriginLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [originQ, originOpen]);
  useEffect(() => {
    if (!destQ || !destOpen) return;
    const t = setTimeout(() => {
      setDestLoading(true);
      searchAirports(destQ).then(setDestRes).catch(() => {}).finally(() => setDestLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [destQ, destOpen]);
  useEffect(() => {
    if (!airlineQ || !airlineOpen) return;
    const t = setTimeout(() => {
      setAirlineLoading(true);
      searchAirlines(airlineQ).then(setAirlineRes).catch(() => {}).finally(() => setAirlineLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [airlineQ, airlineOpen]);

  // Reset to the first step on close so reopening starts fresh (no effect).
  const handleClose = () => { setStep(0); onClose(); };

  // ESC closes + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const selectOrigin = (a: AirportRef) => { setRoute({ ...route, originId: a.iataCode, originCity: a.cityName }); setOriginQ(`${a.name} (${a.iataCode})`); setOriginOpen(false); };
  const selectDest = (a: AirportRef) => { setRoute({ ...route, destinationId: a.iataCode, destinationCity: a.cityName }); setDestQ(`${a.name} (${a.iataCode})`); setDestOpen(false); };
  const selectAirline = (a: AirlineRef) => { setAirline({ ...airline, airlineId: a.iataCode, airlineName: a.name }); setAirlineQ(`${a.name} (${a.iataCode})`); setAirlineOpen(false); };

  const handleSubmit = async () => {
    if (!route.originId || !route.destinationId) { toasts.error('Select both origin and destination airports'); return; }
    if (!route.departureDate || !pricing.basePrice) { toasts.error('Departure date and base price are required'); return; }
    setSubmitting(true);
    try {
      const input: CreateManualFlightInput = {
        originId: route.originId, destinationId: route.destinationId, originCity: route.originCity || undefined, destinationCity: route.destinationCity || undefined,
        departureDate: route.departureDate, departureTime: route.departureTime, arrivalTime: route.arrivalTime, duration: route.duration || undefined,
        airlineId: airline.airlineId || undefined, airlineName: airline.airlineName || undefined, flightNumber: airline.flightNumber || undefined,
        basePrice: parseFloat(pricing.basePrice), currency: pricing.currency, cabinClass: pricing.cabinClass,
        childPricePercent: parseFloat(pricing.childPricePercent) || 75, infantPricePercent: parseFloat(pricing.infantPricePercent) || 10,
        refundable: pricing.refundable, availableSeats: parseInt(pricing.availableSeats) || 50, totalSeats: parseInt(pricing.totalSeats) || 50,
        hasWifi: amenity.hasWifi, hasMeal: amenity.hasMeal, hasEntertainment: amenity.hasEntertainment, hasPowerOutlet: amenity.hasPowerOutlet,
        checkedBaggage: amenity.checkedBaggage || undefined, cabinBaggage: amenity.cabinBaggage || undefined, featured,
      };
      await createManualFlight(input);
      toasts.success('Flight created');
      onCreated(); onClose();
    } catch (err) { toasts.error((err as { message?: string })?.message ?? 'Failed to create flight'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create flight">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={handleClose} />
      <div className="relative z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:max-w-2xl md:max-w-3xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plane className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Create Flight</h2>
              <p className="text-[11px] text-muted-foreground sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        {/* Stepper — numbers only on phones, full labels on sm+ */}
        <div className="hidden shrink-0 border-b border-border px-6 py-3 sm:block">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}</div>
                <span className={`text-xs font-medium ${i <= step ? 'text-foreground' : 'text-muted-foreground'}`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`h-px w-4 rounded-full transition-colors ${i < step ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="relative">
                <label className={labelCls}>Origin *</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input className={`${inputCls} pl-9`} value={originQ} onFocus={() => setOriginOpen(true)} onBlur={() => setTimeout(() => setOriginOpen(false), 200)} onChange={(e) => { setOriginQ(e.target.value); if (!originOpen) setOriginOpen(true); }} placeholder="Search airport by name, city or code…" />
                </div>
                {originOpen && (originRes.length > 0 || originLoading) && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background shadow-lg">
                    {originLoading ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>
                    : originRes.slice(0, 8).map((a) => (
                      <button key={a.iataCode} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted" onMouseDown={() => selectOrigin(a)}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">{a.iataCode}</span>
                        <div className="min-w-0"><p className="truncate font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.cityName}, {a.countryCode}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className={labelCls}>Destination *</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input className={`${inputCls} pl-9`} value={destQ} onFocus={() => setDestOpen(true)} onBlur={() => setTimeout(() => setDestOpen(false), 200)} onChange={(e) => { setDestQ(e.target.value); if (!destOpen) setDestOpen(true); }} placeholder="Search airport…" />
                </div>
                {destOpen && (destRes.length > 0 || destLoading) && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background shadow-lg">
                    {destLoading ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>
                    : destRes.slice(0, 8).map((a) => (
                      <button key={a.iataCode} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted" onMouseDown={() => selectDest(a)}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">{a.iataCode}</span>
                        <div className="min-w-0"><p className="truncate font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.cityName}, {a.countryCode}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Departure Date *</label>
                <input type="date" className={inputCls} value={route.departureDate} onChange={(e) => setRoute({ ...route, departureDate: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={labelCls}>Departure Time</label><input type="time" className={inputCls} value={route.departureTime} onChange={(e) => setRoute({ ...route, departureTime: e.target.value })} /></div>
                <div><label className={labelCls}>Arrival Time</label><input type="time" className={inputCls} value={route.arrivalTime} onChange={(e) => setRoute({ ...route, arrivalTime: e.target.value })} /></div>
              </div>

              <div><label className={labelCls}>Duration</label><input className={inputCls} value={route.duration} onChange={(e) => setRoute({ ...route, duration: e.target.value })} placeholder="e.g. 2h 30m" /></div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="relative">
                <label className={labelCls}>Airline</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input className={`${inputCls} pl-9`} value={airlineQ} onFocus={() => setAirlineOpen(true)} onBlur={() => setTimeout(() => setAirlineOpen(false), 200)} onChange={(e) => { setAirlineQ(e.target.value); if (!airlineOpen) setAirlineOpen(true); }} placeholder="Search airline by name or code…" />
                </div>
                {airlineOpen && (airlineRes.length > 0 || airlineLoading) && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background shadow-lg">
                    {airlineLoading ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>
                    : airlineRes.slice(0, 8).map((a) => (
                      <button key={a.iataCode} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted" onMouseDown={() => selectAirline(a)}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">{a.iataCode}</span>
                        <span className="truncate font-medium">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelCls}>Flight Number</label><input className={inputCls} value={airline.flightNumber} onChange={(e) => setAirline({ ...airline, flightNumber: e.target.value })} placeholder="e.g. EK501" /></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div><label className={labelCls}>Base Price *</label><input type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} value={pricing.basePrice} onChange={(e) => setPricing({ ...pricing, basePrice: e.target.value })} placeholder="250.00" /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div><label className={labelCls}>Currency</label><select className={inputCls} value={pricing.currency} onChange={(e) => setPricing({ ...pricing, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className={labelCls}>Cabin</label><select className={inputCls} value={pricing.cabinClass} onChange={(e) => setPricing({ ...pricing, cabinClass: e.target.value })}>{CABINS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select></div>
                <div><label className={labelCls}>Seats</label><input type="number" min="0" inputMode="numeric" className={inputCls} value={pricing.availableSeats} onChange={(e) => { const v = e.target.value; setPricing({ ...pricing, availableSeats: v, totalSeats: v }); }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Child Price %</label><input type="number" min="0" max="100" inputMode="numeric" className={inputCls} value={pricing.childPricePercent} onChange={(e) => setPricing({ ...pricing, childPricePercent: e.target.value })} /></div>
                <div><label className={labelCls}>Infant Price %</label><input type="number" min="0" max="100" inputMode="numeric" className={inputCls} value={pricing.infantPricePercent} onChange={(e) => setPricing({ ...pricing, infantPricePercent: e.target.value })} /></div>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3.5 text-sm transition-colors hover:bg-muted/50">
                <input type="checkbox" className="accent-primary" checked={pricing.refundable} onChange={(e) => setPricing({ ...pricing, refundable: e.target.checked })} /> Refundable
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In-Flight Amenities</p>
              {([['hasWifi', 'Wi-Fi'], ['hasMeal', 'Meal'], ['hasEntertainment', 'Entertainment'], ['hasPowerOutlet', 'Power Outlet']] as const).map(([k, l]) => (
                <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-muted/50">
                  <input type="checkbox" className="accent-primary" checked={(amenity as unknown as Record<string, boolean>)[k]} onChange={(e) => setAmenity({ ...amenity, [k]: e.target.checked })} />
                  <span className="font-medium">{l}</span>
                </label>
              ))}
              <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Baggage</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={labelCls}>Checked</label><input className={inputCls} value={amenity.checkedBaggage} onChange={(e) => setAmenity({ ...amenity, checkedBaggage: e.target.value })} placeholder="e.g. 2 x 23kg" /></div>
                <div><label className={labelCls}>Cabin</label><input className={inputCls} value={amenity.cabinBaggage} onChange={(e) => setAmenity({ ...amenity, cabinBaggage: e.target.value })} placeholder="e.g. 7kg" /></div>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-muted/50">
                <input type="checkbox" className="accent-primary" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                <span className="font-medium">Feature on homepage</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3.5 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={step === 0} className="gap-1.5"><ChevronLeft className="h-4 w-4" /> Back</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1.5">Next <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating…' : 'Create Flight'}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
