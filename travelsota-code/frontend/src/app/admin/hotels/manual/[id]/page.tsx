'use client';
import { confirmDialog } from '@/components/ui/confirm-dialog';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { uploadImage } from '@/features/upload/api';
import { handleHotelImageError } from '@/lib/utils/hotel-image-fallback';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import {
  getManualHotel,
  updateManualHotel,
  addRoom,
  deleteRoom,
  type ManualHotel,
  type ManualHotelRoom,
} from '@/features/admin/api/admin-manual-hotels';

type Tab = 'general' | 'rooms' | 'location' | 'contact' | 'seo' | 'amenities' | 'gallery';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' }, { key: 'rooms', label: 'Rooms' }, { key: 'location', label: 'Location' },
  { key: 'contact', label: 'Contact' }, { key: 'seo', label: 'SEO' }, { key: 'amenities', label: 'Amenities' }, { key: 'gallery', label: 'Gallery' },
];

const FIXED_AMENITIES = ['Free WiFi','Swimming Pool','Parking','Restaurant','Gym/Fitness Center','Spa','24-Hour Front Desk','Airport Shuttle','Bar/Lounge','Conference Rooms'];
const AMENITY_CODES: Record<string, string> = { 'Free WiFi':'wifi','Swimming Pool':'pool','Parking':'parking','Restaurant':'restaurant','Gym/Fitness Center':'gym','Spa':'spa','24-Hour Front Desk':'frontdesk','Airport Shuttle':'shuttle','Bar/Lounge':'bar','Conference Rooms':'conference' };
function codeToLabel(code: string): string { for (const [l, c] of Object.entries(AMENITY_CODES)) if (c === code) return l; return code; }

function EditHotelPageInner() {
  const router = useRouter();
  const params = useParams();
  const toasts = useToast();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const [tab, setTab] = useState<Tab>('general');
  const [hotel, setHotel] = useState<ManualHotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [general, setGeneral] = useState({ name:'', accommodationType:'', stars:'', rating:'', currency:'USD', discount:'', description:'', refundable:false, checkinTime:'14:00', checkoutTime:'12:00', featured:false, hotelOrder:'0', status:'active' });
  const [location, setLocation] = useState({ location:'', address:'', latitude:'', longitude:'', destinationCode:'', destinationName:'' });
  const [contact, setContact] = useState({ email:'', phone:'', website:'', bookingAgeRequirement:'18' });
  const [seo, setSeo] = useState({ metaTitle:'', metaKeywords:'', metaDesc:'' });
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [galleryImages, setGalleryImages] = useState<{url:string;isDefault?:boolean}[]>([]);
  const [rooms, setRooms] = useState<ManualHotelRoom[]>([]);

  useEffect(() => {
    getManualHotel(id).then((h) => {
      setHotel(h);
      setGeneral({ name:h.name, accommodationType:h.accommodationType??'', stars:h.stars?.toString()??'', rating:h.rating?.toString()??'', currency:h.currency, discount:h.discount?.toString()??'', description:h.description??'', refundable:h.refundable, checkinTime:h.checkinTime, checkoutTime:h.checkoutTime, featured:h.featured, hotelOrder:h.hotelOrder?.toString()??'0', status:h.status });
      setLocation({ location:h.location, address:h.address??'', latitude:h.latitude?.toString()??'', longitude:h.longitude?.toString()??'', destinationCode:h.destinationCode??'', destinationName:h.destinationName??'' });
      setContact({ email:h.email??'', phone:h.phone??'', website:h.website??'', bookingAgeRequirement:h.bookingAgeRequirement?.toString()??'18' });
      setSeo({ metaTitle:h.metaTitle??'', metaKeywords:h.metaKeywords??'', metaDesc:h.metaDesc??'' });
      setSelectedAmenities(((h.amenities as string[])??[]).map(codeToLabel));
      setGalleryImages((h.images as {url:string;isDefault?:boolean}[])??[]);
      setRooms(h.rooms??[]);
      setLoading(false);
    }).catch(() => { toasts.error('Failed to load hotel'); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateManualHotel(id, {
        name:general.name, accommodationType:general.accommodationType||undefined, stars:general.stars?parseInt(general.stars):undefined,
        rating:general.rating?parseFloat(general.rating):undefined, currency:general.currency, discount:general.discount?parseFloat(general.discount):undefined,
        description:general.description||undefined, refundable:general.refundable, checkinTime:general.checkinTime, checkoutTime:general.checkoutTime,
        featured:general.featured, hotelOrder:parseInt(general.hotelOrder)||0, status:general.status,
        location:location.location, address:location.address||undefined, latitude:location.latitude?parseFloat(location.latitude):undefined, longitude:location.longitude?parseFloat(location.longitude):undefined,
        destinationCode:location.destinationCode||undefined, destinationName:location.destinationName||undefined,
        email:contact.email||undefined, phone:contact.phone||undefined, website:contact.website||undefined, bookingAgeRequirement:parseInt(contact.bookingAgeRequirement)||18,
        metaTitle:seo.metaTitle||undefined, metaKeywords:seo.metaKeywords||undefined, metaDesc:seo.metaDesc||undefined,
        amenities:selectedAmenities.map((a)=>AMENITY_CODES[a]??a), images:galleryImages,
      });
      toasts.success('Hotel updated');
      // Refresh the list cache so returning to the table shows the edit
      // immediately — no stale rows after a save.
      queryClient.invalidateQueries({ queryKey: ['manual-hotels'] });
    } catch (err) { toasts.error((err as {message?:string})?.message??'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleImageUpload = useCallback(async (e:React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setUploading(true);
    try { for (const file of Array.from(files)) { const url = await uploadImage(file); setGalleryImages((p)=>[...p,{url,isDefault:p.length===0}]); } }
    catch { toasts.error('Upload failed'); }
    finally { setUploading(false); }
  }, [toasts]);

  const [newRoom, setNewRoom] = useState({ name:'', basePrice:'', maxAdults:'2', availableQuantity:'1', boardType:'' });
  const [addingRoom, setAddingRoom] = useState(false);

  const handleAddRoom = async () => {
    if (!newRoom.name.trim()||!newRoom.basePrice) return;
    setAddingRoom(true);
    try { const r = await addRoom(id,{ name:newRoom.name.trim(), basePrice:parseFloat(newRoom.basePrice), maxAdults:parseInt(newRoom.maxAdults)||2, availableQuantity:parseInt(newRoom.availableQuantity)||1, boardType:newRoom.boardType||undefined }); setRooms([...rooms,r]); setNewRoom({ name:'', basePrice:'', maxAdults:'2', availableQuantity:'1', boardType:'' }); toasts.success('Room added'); }
    catch (err) { toasts.error((err as {message?:string})?.message??'Failed to add room'); }
    finally { setAddingRoom(false); }
  };

  const handleDeleteRoom = async (roomId:string) => { if(!(await confirmDialog({ title: 'Delete this room?', confirmLabel: 'Delete' })))return; try{await deleteRoom(roomId);setRooms(rooms.filter(r=>r.id!==roomId));toasts.success('Room deleted');}catch(err){toasts.error((err as {message?:string})?.message??'Failed to delete room');} };

  if (loading) return <div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!hotel) return <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">Hotel not found</div>;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={hotel.name}
        description={`Manage details, rooms, pricing, and amenities for ${hotel.location || 'this property'}.`}
        breadcrumbs={[
          { label: 'Hotels' },
          { label: 'Manual', href: '/admin/hotels/manual' },
          { label: hotel.name || 'Edit Hotel' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/hotels/manual')}>
              Back to List
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="shadow-sm">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content Panels */}
        <div className="p-4 sm:p-6 lg:p-8">
        {tab==='general' && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hotel Name</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.name} onChange={(e)=>setGeneral({...general,name:e.target.value})} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label><select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.status} onChange={(e)=>setGeneral({...general,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Draft</option></select></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</label><select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.accommodationType} onChange={(e)=>setGeneral({...general,accommodationType:e.target.value})}><option value="">Select</option>{['Hotel','Apartment','Villa','Resort','Guest House','Hostel','Chalet','Cottage','Bungalow','Holiday Home'].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stars</label><select className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.stars} onChange={(e)=>setGeneral({...general,stars:e.target.value})}><option value="">Select</option>{[1,2,3,4,5].map(s=><option key={s} value={s}>{s} Star</option>)}</select></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rating (0-10)</label><input type="number" step="0.1" min="0" max="10" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={general.rating} onChange={(e)=>setGeneral({...general,rating:e.target.value})} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={general.featured} onChange={(e)=>setGeneral({...general,featured:e.target.checked})} /> Featured on homepage</label>
              <div className="flex items-center gap-2"><label className="text-sm text-muted-foreground">Order</label><input type="number" className="w-20 rounded-lg border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:outline-none" value={general.hotelOrder} onChange={(e)=>setGeneral({...general,hotelOrder:e.target.value})} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={general.refundable} onChange={(e)=>setGeneral({...general,refundable:e.target.checked})} /> Refundable</label>
            </div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label><textarea className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={4} value={general.description} onChange={(e)=>setGeneral({...general,description:e.target.value})} /></div>
          </div>
        )}

        {tab==='rooms' && (
          <div className="space-y-4">
            <div className="rounded-lg border">
              <div className="grid grid-cols-6 gap-2 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground"><span>Name</span><span>Type</span><span>Price</span><span>Adults</span><span>Qty</span><span className="text-right">Actions</span></div>
              {rooms.length===0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No rooms yet. Add one below.</div>
              : rooms.map(room=>(
                <div key={room.id} className="grid grid-cols-6 gap-2 border-b px-4 py-2.5 text-sm last:border-b-0">
                  <span className="font-medium">{room.name}</span><span className="text-muted-foreground">{room.boardType??'—'}</span><span className="tabular-nums">{room.currency} {room.basePrice}</span><span>{room.maxAdults}</span><span>{room.availableQuantity}</span>
                  <div className="text-right"><Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={()=>handleDeleteRoom(room.id)}>Delete</Button></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:items-end">
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</label><input className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={newRoom.name} onChange={(e)=>setNewRoom({...newRoom,name:e.target.value})} placeholder="Deluxe Suite" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price</label><input type="number" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={newRoom.basePrice} onChange={(e)=>setNewRoom({...newRoom,basePrice:e.target.value})} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adults</label><input type="number" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={newRoom.maxAdults} onChange={(e)=>setNewRoom({...newRoom,maxAdults:e.target.value})} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty</label><input type="number" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={newRoom.availableQuantity} onChange={(e)=>setNewRoom({...newRoom,availableQuantity:e.target.value})} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Board</label><select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20" value={newRoom.boardType} onChange={(e)=>setNewRoom({...newRoom,boardType:e.target.value})}><option value="">Select</option>{['Room Only','Bed & Breakfast','Half Board','Full Board','All Inclusive','Self Catering'].map(b=><option key={b} value={b}>{b}</option>)}</select></div>
              <Button size="sm" onClick={handleAddRoom} disabled={addingRoom}>{addingRoom?'Adding...':'Add Room'}</Button>
            </div>
          </div>
        )}

        {tab==='location' && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location / City</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.location} onChange={(e)=>setLocation({...location,location:e.target.value})} /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</label><textarea className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={2} value={location.address} onChange={(e)=>setLocation({...location,address:e.target.value})} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lat</label><input type="number" step="any" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.latitude} onChange={(e)=>setLocation({...location,latitude:e.target.value})} /></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lng</label><input type="number" step="any" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.longitude} onChange={(e)=>setLocation({...location,longitude:e.target.value})} /></div></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dest Code</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.destinationCode} onChange={(e)=>setLocation({...location,destinationCode:e.target.value})} /></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dest Name</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={location.destinationName} onChange={(e)=>setLocation({...location,destinationName:e.target.value})} /></div></div>
          </div>
        )}

        {tab==='contact' && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label><input type="email" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.email} onChange={(e)=>setContact({...contact,email:e.target.value})} /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.phone} onChange={(e)=>setContact({...contact,phone:e.target.value})} /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Website</label><input type="url" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.website} onChange={(e)=>setContact({...contact,website:e.target.value})} /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booking Age</label><input type="number" min="0" className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={contact.bookingAgeRequirement} onChange={(e)=>setContact({...contact,bookingAgeRequirement:e.target.value})} /></div>
          </div>
        )}

        {tab==='seo' && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta Title</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={seo.metaTitle} onChange={(e)=>setSeo({...seo,metaTitle:e.target.value})} /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta Keywords</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" value={seo.metaKeywords} onChange={(e)=>setSeo({...seo,metaKeywords:e.target.value})} /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta Description</label><textarea className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={3} value={seo.metaDesc} onChange={(e)=>setSeo({...seo,metaDesc:e.target.value})} /></div>
          </div>
        )}

        {tab==='amenities' && (
          <div className="space-y-2">
            {FIXED_AMENITIES.map(amenity=>(
              <label key={amenity} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3.5 text-sm transition-colors hover:bg-muted/50">
                <input type="checkbox" className="accent-primary" checked={selectedAmenities.includes(amenity)} onChange={(e)=>{if(e.target.checked)setSelectedAmenities([...selectedAmenities,amenity]);else setSelectedAmenities(selectedAmenities.filter(a=>a!==amenity));}} />{amenity}
              </label>
            ))}
          </div>
        )}

        {tab==='gallery' && (
          <div className="space-y-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              <Upload className="h-4 w-4" />{uploading?'Uploading...':'Upload Images'}
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
            {galleryImages.length>0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {galleryImages.map((img,idx)=>(
                  <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`Gallery ${idx+1}`} className="h-full w-full object-cover" onError={handleHotelImageError} />
                    <button className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100" onClick={()=>setGalleryImages(p=>p.filter((_,i)=>i!==idx))}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default function EditHotelPage() {
  return <Suspense fallback={<div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><EditHotelPageInner /></Suspense>;
}
