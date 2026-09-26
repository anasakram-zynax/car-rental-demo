/* Hallmark · v1.1 · component: edit-page · genre: premium-op · theme: Atelier · states: default loading error saving */
'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plane, Clock, Users, DollarSign } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { getManualFlight, updateManualFlight, type ManualFlight } from '@/features/admin/api/admin-manual-flights';

const TABS = ['Route', 'Airline', 'Pricing', 'Amenities'] as const;

function EditFlightPageInner() {
  const router = useRouter();
  const params = useParams();
  const toasts = useToast();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const [tab, setTab] = useState(0);
  const [flight, setFlight] = useState<ManualFlight | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [route, setRoute] = useState({ originId: '', destinationId: '', originCity: '', destinationCity: '', departureDate: '', departureTime: '', arrivalTime: '', duration: '' });
  const [airline, setAirline] = useState({ airlineId: '', airlineName: '', flightNumber: '' });
  const [pricing, setPricing] = useState({ basePrice: '', currency: 'USD', cabinClass: 'economy', childPricePercent: '75', infantPricePercent: '10', refundable: false, availableSeats: '50', totalSeats: '50' });
  const [amenity, setAmenity] = useState({ hasWifi: false, hasMeal: false, hasEntertainment: false, hasPowerOutlet: false, checkedBaggage: '', cabinBaggage: '' });
  const [featured, setFeatured] = useState(false);
  const [flightOrder, setFlightOrder] = useState('0');
  const [status, setStatus] = useState('active');

  useEffect(() => {
    getManualFlight(id).then((f) => {
      setFlight(f);
      setRoute({ originId: f.originId, destinationId: f.destinationId, originCity: f.originCity ?? '', destinationCity: f.destinationCity ?? '', departureDate: f.departureDate?.split('T')[0] ?? '', departureTime: f.departureTime, arrivalTime: f.arrivalTime, duration: f.duration ?? '' });
      setAirline({ airlineId: f.airlineId ?? '', airlineName: f.airlineName ?? '', flightNumber: f.flightNumber ?? '' });
      setPricing({ basePrice: f.basePrice?.toString() ?? '', currency: f.currency, cabinClass: f.cabinClass, childPricePercent: f.childPricePercent?.toString() ?? '75', infantPricePercent: f.infantPricePercent?.toString() ?? '10', refundable: f.refundable, availableSeats: f.availableSeats?.toString() ?? '50', totalSeats: f.totalSeats?.toString() ?? '50' });
      setAmenity({ hasWifi: f.hasWifi, hasMeal: f.hasMeal, hasEntertainment: f.hasEntertainment, hasPowerOutlet: f.hasPowerOutlet, checkedBaggage: f.checkedBaggage ?? '', cabinBaggage: f.cabinBaggage ?? '' });
      setFeatured(f.featured); setFlightOrder(f.flightOrder?.toString() ?? '0'); setStatus(f.status);
      setLoading(false);
    }).catch(() => { toasts.error('Failed to load flight'); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateManualFlight(id, {
        originId: route.originId, destinationId: route.destinationId, originCity: route.originCity || undefined, destinationCity: route.destinationCity || undefined,
        departureDate: route.departureDate, departureTime: route.departureTime, arrivalTime: route.arrivalTime, duration: route.duration || undefined,
        airlineId: airline.airlineId || undefined, airlineName: airline.airlineName || undefined, flightNumber: airline.flightNumber || undefined,
        basePrice: parseFloat(pricing.basePrice), currency: pricing.currency, cabinClass: pricing.cabinClass,
        childPricePercent: parseFloat(pricing.childPricePercent) || 75, infantPricePercent: parseFloat(pricing.infantPricePercent) || 10,
        refundable: pricing.refundable, availableSeats: parseInt(pricing.availableSeats) || 50, totalSeats: parseInt(pricing.totalSeats) || 50,
        hasWifi: amenity.hasWifi, hasMeal: amenity.hasMeal, hasEntertainment: amenity.hasEntertainment, hasPowerOutlet: amenity.hasPowerOutlet,
        checkedBaggage: amenity.checkedBaggage || undefined, cabinBaggage: amenity.cabinBaggage || undefined,
        featured, flightOrder: parseInt(flightOrder) || 0, status,
      });
      toasts.success('Flight updated');
      // Refresh the list cache so returning to the table shows the edit
      // immediately — no stale rows after a save.
      queryClient.invalidateQueries({ queryKey: ['manual-flights'] });
    } catch (err) { toasts.error((err as { message?: string })?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><div className="h-8 w-8 animate-pulse rounded-lg bg-muted/60" /><div className="h-7 w-52 animate-pulse rounded-lg bg-muted/60" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />)}</div>
      <div className="-mx-1 flex gap-0 overflow-x-auto border-b border-border/40 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 w-20 animate-pulse rounded-t-lg bg-muted/40" />)}</div>
      <div className="space-y-4 max-w-xl">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted/40" />)}</div>
    </div>
  );
  if (!flight) return <div className="flex h-96 items-center justify-center"><div className="text-center"><Plane className="mx-auto h-8 w-8 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">Flight not found</p><Button variant="outline" size="sm" className="mt-3" onClick={() => router.push('/admin/flights/manual')}>Back to list</Button></div></div>;

  const routeLabel = `${flight.originId} → ${flight.destinationId}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={routeLabel}
        description={`${flight.airlineName || flight.airlineId || 'Flight'} ${flight.flightNumber ? `· ${flight.flightNumber}` : ''} · ${flight.departureTime} – ${flight.arrivalTime}`}
        breadcrumbs={[
          { label: 'Flights' },
          { label: 'Manual', href: '/admin/flights/manual' },
          { label: routeLabel },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'secondary'} className="text-xs">
              {status}
            </Badge>
            {featured && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                Featured
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/flights/manual')}>
              Back to List
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="shadow-sm">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Seats', value: `${flight.availableSeats}/${flight.totalSeats}`, sub: pricing.refundable ? 'Refundable' : 'Non-refund', icon: Users, accent: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40' },
          { label: 'Price', value: `${flight.currency} ${flight.basePrice.toLocaleString()}`, sub: pricing.cabinClass.replace('_', ' '), icon: DollarSign, accent: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40' },
          { label: 'Child', value: `${flight.currency} ${Math.round(flight.basePrice * flight.childPricePercent / 100).toLocaleString()}`, sub: `${flight.childPricePercent}% of adult`, icon: Users, accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
          { label: 'Departure', value: flight.departureTime, sub: flight.duration ?? '—', icon: Clock, accent: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <div key={label} className="min-w-0 rounded-xl border border-border bg-card p-4 transition-all hover:border-border hover:shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent}`}><Icon className="h-3.5 w-3.5" /></div>
            </div>
            <p className="mt-2 text-lg font-bold tabular-nums tracking-tight text-foreground">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                tab === i
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              onClick={() => setTab(i)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content Panels */}
        <div className="p-4 sm:p-6 lg:p-8">
        {tab === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origin IATA</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm uppercase transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={route.originId} onChange={(e) => setRoute({ ...route, originId: e.target.value.toUpperCase() })} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination IATA</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm uppercase transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={route.destinationId} onChange={(e) => setRoute({ ...route, destinationId: e.target.value.toUpperCase() })} /></div>
            </div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Departure Date</label><input type="date" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={route.departureDate} onChange={(e) => setRoute({ ...route, departureDate: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Departure</label><input type="time" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={route.departureTime} onChange={(e) => setRoute({ ...route, departureTime: e.target.value })} /></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arrival</label><input type="time" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={route.arrivalTime} onChange={(e) => setRoute({ ...route, arrivalTime: e.target.value })} /></div></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={route.duration} onChange={(e) => setRoute({ ...route, duration: e.target.value })} placeholder="e.g. 2h 30m" /></div>
          </div>
        )}
        {tab === 1 && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Airline Name</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={airline.airlineName} onChange={(e) => setAirline({ ...airline, airlineName: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Airline Code</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm uppercase transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={airline.airlineId} onChange={(e) => setAirline({ ...airline, airlineId: e.target.value.toUpperCase() })} /></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flight Number</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={airline.flightNumber} onChange={(e) => setAirline({ ...airline, flightNumber: e.target.value })} /></div></div>
          </div>
        )}
        {tab === 2 && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base Price</label><input type="number" min="0" step="0.01" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={pricing.basePrice} onChange={(e) => setPricing({ ...pricing, basePrice: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Currency</label><select className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={pricing.currency} onChange={(e) => setPricing({ ...pricing, currency: e.target.value })}>{['USD','EUR','GBP','AED','SAR'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cabin</label><select className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={pricing.cabinClass} onChange={(e) => setPricing({ ...pricing, cabinClass: e.target.value })}>{['economy','premium_economy','business','first'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seats</label><input type="number" min="0" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20" value={pricing.availableSeats} onChange={(e) => { const v = e.target.value; setPricing({ ...pricing, availableSeats: v, totalSeats: v }); }} /></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Child %</label><input type="number" min="0" max="100" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" value={pricing.childPricePercent} onChange={(e) => setPricing({ ...pricing, childPricePercent: e.target.value })} /></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Infant %</label><input type="number" min="0" max="100" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" value={pricing.infantPricePercent} onChange={(e) => setPricing({ ...pricing, infantPricePercent: e.target.value })} /></div></div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm transition-all hover:bg-muted/40 cursor-pointer"><input type="checkbox" className="accent-primary" checked={pricing.refundable} onChange={(e) => setPricing({ ...pricing, refundable: e.target.checked })} /><span className="font-medium">Refundable</span></label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm transition-all hover:bg-muted/40 cursor-pointer"><input type="checkbox" className="accent-primary" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /><span className="font-medium">Featured</span></label>
              <div className="flex items-center gap-2"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Order</label><input type="number" className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-sm" value={flightOrder} onChange={(e) => setFlightOrder(e.target.value)} /></div>
              <div className="flex items-center gap-2"><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label><select className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Draft</option></select></div>
            </div>
          </div>
        )}
        {tab === 3 && (
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In-Flight Amenities</p>
            <div className="space-y-2">
              {([['hasWifi','Wi-Fi'],['hasMeal','Meal service'],['hasEntertainment','In-flight entertainment'],['hasPowerOutlet','Power outlets']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3 text-sm transition-all hover:bg-muted/40 cursor-pointer"><input type="checkbox" className="accent-primary" checked={(amenity as any)[k]} onChange={(e) => setAmenity({ ...amenity, [k]: e.target.checked })} /><span className="font-medium">{l}</span></label>
              ))}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">Baggage Allowance</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checked</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" value={amenity.checkedBaggage} onChange={(e) => setAmenity({ ...amenity, checkedBaggage: e.target.value })} placeholder="e.g. 2 x 23kg" /></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cabin</label><input className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" value={amenity.cabinBaggage} onChange={(e) => setAmenity({ ...amenity, cabinBaggage: e.target.value })} placeholder="e.g. 7kg" /></div></div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default function EditFlightPage() {
  return <Suspense fallback={<div className="space-y-6"><div className="h-8 w-52 animate-pulse rounded-lg bg-muted/60" /><div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />)}</div></div>}><EditFlightPageInner /></Suspense>;
}
