'use client';

import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { createManualHotel, type CreateManualHotelInput, type CreateManualHotelRoomInput } from '@/features/admin/api/admin-manual-hotels';
import { uploadImage } from '@/features/upload/api';
import { Button } from '@/components/ui/button';
import { Plus, X, Upload, Hotel } from 'lucide-react';

type Step = 'general' | 'rooms' | 'location' | 'contact' | 'seo' | 'amenities' | 'gallery';

const STEPS: { key: Step; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'location', label: 'Location' },
  { key: 'contact', label: 'Contact' },
  { key: 'seo', label: 'SEO' },
  { key: 'amenities', label: 'Amenities' },
  { key: 'gallery', label: 'Gallery' },
];

const FIXED_AMENITIES = [
  'Free WiFi', 'Swimming Pool', 'Parking', 'Restaurant', 'Gym/Fitness Center',
  'Spa', '24-Hour Front Desk', 'Airport Shuttle', 'Bar/Lounge', 'Conference Rooms',
];

const AMENITY_CODES: Record<string, string> = {
  'Free WiFi': 'wifi', 'Swimming Pool': 'pool', 'Parking': 'parking', 'Restaurant': 'restaurant',
  'Gym/Fitness Center': 'gym', 'Spa': 'spa', '24-Hour Front Desk': 'frontdesk',
  'Airport Shuttle': 'shuttle', 'Bar/Lounge': 'bar', 'Conference Rooms': 'conference',
};

interface CreateHotelModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateHotelModal({ open, onClose, onCreated }: CreateHotelModalProps) {
  const toasts = useToast();
  const [step, setStep] = useState<Step>('general');
  const [submitting, setSubmitting] = useState(false);

  const [general, setGeneral] = useState({ name: '', accommodationType: '', stars: '', rating: '', currency: 'USD', discount: '', description: '', refundable: false, checkinTime: '14:00', checkoutTime: '12:00' });
  const [rooms, setRooms] = useState([{ name: '', basePrice: '', maxAdults: '2', availableQuantity: '1', boardType: '' }]);
  const [location, setLocation] = useState({ location: '', address: '', latitude: '', longitude: '', destinationCode: '', destinationName: '' });
  const [contact, setContact] = useState({ email: '', phone: '', website: '', bookingAgeRequirement: '18' });
  const [seo, setSeo] = useState({ metaTitle: '', metaKeywords: '', metaDesc: '' });
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [galleryImages, setGalleryImages] = useState<{ url: string; isDefault?: boolean }[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  // Reset to the first step on close so reopening starts fresh (no effect).
  const handleClose = () => { setStep('general'); onClose(); };

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

  const handleNext = () => { const next = currentStepIdx + 1; if (next < STEPS.length) setStep(STEPS[next].key); };
  const handlePrev = () => { const prev = currentStepIdx - 1; if (prev >= 0) setStep(STEPS[prev].key); };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setUploadingImages(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadImage(file);
        setGalleryImages((prev) => [...prev, { url, isDefault: prev.length === 0 }]);
      }
    } catch { toasts.error('Image upload failed'); }
    finally { setUploadingImages(false); }
  }, [toasts]);

  const handleSubmit = async () => {
    if (!general.name.trim()) { toasts.error('Hotel name is required'); return; }
    if (!location.location.trim()) { toasts.error('Location is required'); return; }
    const validRooms = rooms.filter((r) => r.name.trim() && r.basePrice);
    if (validRooms.length === 0) { toasts.error('At least one room with name and price is required'); return; }

    setSubmitting(true);
    try {
      const roomInputs: CreateManualHotelRoomInput[] = validRooms.map((r) => ({
        name: r.name.trim(),
        basePrice: parseFloat(r.basePrice),
        maxAdults: parseInt(r.maxAdults, 10) || 2,
        availableQuantity: parseInt(r.availableQuantity, 10) || 1,
        boardType: r.boardType || undefined,
      }));
      const input: CreateManualHotelInput = {
        name: general.name.trim(),
        accommodationType: general.accommodationType || undefined,
        stars: general.stars ? parseInt(general.stars) : undefined,
        rating: general.rating ? parseFloat(general.rating) : undefined,
        currency: general.currency,
        discount: general.discount ? parseFloat(general.discount) : undefined,
        description: general.description || undefined,
        refundable: general.refundable,
        checkinTime: general.checkinTime,
        checkoutTime: general.checkoutTime,
        location: location.location.trim(),
        address: location.address || undefined,
        latitude: location.latitude ? parseFloat(location.latitude) : undefined,
        longitude: location.longitude ? parseFloat(location.longitude) : undefined,
        destinationCode: location.destinationCode || undefined,
        destinationName: location.destinationName || undefined,
        email: contact.email || undefined, phone: contact.phone || undefined, website: contact.website || undefined,
        bookingAgeRequirement: parseInt(contact.bookingAgeRequirement, 10) || 18,
        metaTitle: seo.metaTitle || undefined, metaKeywords: seo.metaKeywords || undefined, metaDesc: seo.metaDesc || undefined,
        amenities: selectedAmenities.map((a) => AMENITY_CODES[a] ?? a),
        images: galleryImages.length > 0 ? galleryImages : undefined,
        rooms: roomInputs,
      };
      await createManualHotel(input);
      toasts.success('Hotel created');
      onCreated(); onClose();
    } catch (err) { toasts.error((err as { message?: string })?.message ?? 'Failed to create hotel'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create hotel">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:max-w-3xl md:max-w-4xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hotel className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Create New Hotel</h2>
              <p className="text-[11px] text-muted-foreground sm:hidden">Step {currentStepIdx + 1} of {STEPS.length} · {STEPS[currentStepIdx].label}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        {/* Progress Steps — labels hidden on phones (header shows the step) */}
        <div className="hidden border-b border-border px-6 py-3 sm:block">
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  i <= currentStepIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </span>
                <span className={`text-xs font-medium ${i <= currentStepIdx ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <div className="mx-0.5 h-px w-3 bg-border" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hotel Name *</label>
                <input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} placeholder="e.g. Grand Plaza Hotel" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                  <select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.accommodationType} onChange={(e) => setGeneral({ ...general, accommodationType: e.target.value })}>
                    <option value="">Select type</option>
                    {['Hotel','Apartment','Villa','Resort','Guest House','Hostel','Chalet','Cottage','Bungalow','Holiday Home'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stars</label>
                  <select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.stars} onChange={(e) => setGeneral({ ...general, stars: e.target.value })}>
                    <option value="">Select</option>
                    {[1,2,3,4,5].map((s) => <option key={s} value={s}>{s} Star</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rating (0-10)</label>
                  <input type="number" step="0.1" min="0" max="10" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.rating} onChange={(e) => setGeneral({ ...general, rating: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Currency</label>
                  <select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.currency} onChange={(e) => setGeneral({ ...general, currency: e.target.value })}>
                    {['USD','EUR','GBP','AED','SAR'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discount (%)</label>
                <input type="number" min="0" max="100" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.discount} onChange={(e) => setGeneral({ ...general, discount: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={3} value={general.description} onChange={(e) => setGeneral({ ...general, description: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary" checked={general.refundable} onChange={(e) => setGeneral({ ...general, refundable: e.target.checked })} /> Refundable
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Check-in</label>
                  <input type="time" className="rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.checkinTime} onChange={(e) => setGeneral({ ...general, checkinTime: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Check-out</label>
                  <input type="time" className="rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.checkoutTime} onChange={(e) => setGeneral({ ...general, checkoutTime: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {step === 'rooms' && (
            <div className="space-y-4">
              {rooms.map((room, idx) => (
                <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Room {idx + 1}</span>
                    {rooms.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setRooms(rooms.filter((_, i) => i !== idx))}>Remove</Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room Name *</label>
                      <input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={room.name} onChange={(e) => { const next = [...rooms]; next[idx] = { ...next[idx], name: e.target.value }; setRooms(next); }} placeholder="Deluxe Suite" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base Price *</label>
                      <input type="number" min="0" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={room.basePrice} onChange={(e) => { const next = [...rooms]; next[idx] = { ...next[idx], basePrice: e.target.value }; setRooms(next); }} placeholder="150" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Adults</label>
                      <input type="number" min="1" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={room.maxAdults} onChange={(e) => { const next = [...rooms]; next[idx] = { ...next[idx], maxAdults: e.target.value }; setRooms(next); }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantity</label>
                      <input type="number" min="1" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={room.availableQuantity} onChange={(e) => { const next = [...rooms]; next[idx] = { ...next[idx], availableQuantity: e.target.value }; setRooms(next); }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Board</label>
                      <select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={room.boardType} onChange={(e) => { const next = [...rooms]; next[idx] = { ...next[idx], boardType: e.target.value }; setRooms(next); }}>
                        <option value="">Select</option>
                        {['Room Only','Bed & Breakfast','Half Board','Full Board','All Inclusive','Self Catering'].map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRooms([...rooms, { name: '', basePrice: '', maxAdults: '2', availableQuantity: '1', boardType: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Add Room
              </Button>
            </div>
          )}

          {step === 'location' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location / City *</label>
                <input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.location} onChange={(e) => setLocation({ ...location, location: e.target.value })} placeholder="e.g. Dubai" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Address</label>
                <textarea className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={2} value={location.address} onChange={(e) => setLocation({ ...location, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Latitude</label>
                  <input type="number" step="any" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.latitude} onChange={(e) => setLocation({ ...location, latitude: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Longitude</label>
                  <input type="number" step="any" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.longitude} onChange={(e) => setLocation({ ...location, longitude: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination Code</label>
                  <input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.destinationCode} onChange={(e) => setLocation({ ...location, destinationCode: e.target.value })} placeholder="e.g. DXB" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination Name</label>
                  <input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.destinationName} onChange={(e) => setLocation({ ...location, destinationName: e.target.value })} placeholder="e.g. Dubai" />
                </div>
              </div>
            </div>
          )}

          {step === 'contact' && (
            <div className="space-y-4">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label><input type="email" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="hotel@example.com" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+1-234-567-8900" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Website</label><input type="url" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.website} onChange={(e) => setContact({ ...contact, website: e.target.value })} placeholder="https://..." /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booking Age Requirement</label><input type="number" min="0" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.bookingAgeRequirement} onChange={(e) => setContact({ ...contact, bookingAgeRequirement: e.target.value })} /></div>
            </div>
          )}

          {step === 'seo' && (
            <div className="space-y-4">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta Title</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={seo.metaTitle} onChange={(e) => setSeo({ ...seo, metaTitle: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta Keywords</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={seo.metaKeywords} onChange={(e) => setSeo({ ...seo, metaKeywords: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta Description</label><textarea className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={3} value={seo.metaDesc} onChange={(e) => setSeo({ ...seo, metaDesc: e.target.value })} /></div>
            </div>
          )}

          {step === 'amenities' && (
            <div className="space-y-2">
              {FIXED_AMENITIES.map((amenity) => (
                <label key={amenity} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3.5 text-sm transition-colors hover:bg-muted/50">
                  <input type="checkbox" className="accent-primary" checked={selectedAmenities.includes(amenity)} onChange={(e) => { if (e.target.checked) setSelectedAmenities([...selectedAmenities, amenity]); else setSelectedAmenities(selectedAmenities.filter((a) => a !== amenity)); }} />
                  {amenity}
                </label>
              ))}
            </div>
          )}

          {step === 'gallery' && (
            <div className="space-y-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Upload className="h-4 w-4" />
                {uploadingImages ? 'Uploading...' : 'Upload Images'}
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImages} />
              </label>
              {galleryImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {galleryImages.map((img, idx) => (
                    <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={`Gallery ${idx + 1}`} className="h-full w-full object-cover" />
                      <button className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" onClick={() => setGalleryImages((prev) => prev.filter((_, i) => i !== idx))}>x</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5 sm:px-6">
          <Button variant="ghost" onClick={handlePrev} disabled={currentStepIdx === 0}>Previous</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            {currentStepIdx < STEPS.length - 1 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating...' : 'Create Hotel'}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
