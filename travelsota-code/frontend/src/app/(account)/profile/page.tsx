'use client';

import { useEffect, useState } from 'react';
import { useCustomerProfile, useUpdateProfile } from '@/features/account/hooks/use-account';
import { useToast } from '@/hooks/useToast';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import Button from '@/components/ui/button/Button';

const CURRENCIES = [
  { value: 'USD', label: 'USD – US Dollar' },
  { value: 'EUR', label: 'EUR – Euro' },
  { value: 'GBP', label: 'GBP – British Pound' },
  { value: 'SAR', label: 'SAR – Saudi Riyal' },
  { value: 'AED', label: 'AED – UAE Dirham' },
  { value: 'QAR', label: 'QAR – Qatari Riyal' },
  { value: 'BHD', label: 'BHD – Bahraini Dinar' },
  { value: 'KWD', label: 'KWD – Kuwaiti Dinar' },
  { value: 'OMR', label: 'OMR – Omani Rial' },
  { value: 'JOD', label: 'JOD – Jordanian Dinar' },
  { value: 'EGP', label: 'EGP – Egyptian Pound' },
  { value: 'TRY', label: 'TRY – Turkish Lira' },
  { value: 'PKR', label: 'PKR – Pakistani Rupee' },
  { value: 'INR', label: 'INR – Indian Rupee' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ur', label: 'Urdu' },
];

export default function ProfilePage() {
  const toast = useToast();
  const { data: profile, isLoading } = useCustomerProfile();
  const updateProfile = useUpdateProfile();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dateOfBirth: '',
    nationality: '',
    preferredCurrency: '',
    preferredLanguage: '',
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        phone: profile.phone ?? '',
        dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '',
        nationality: profile.nationality ?? '',
        preferredCurrency: profile.preferredCurrency ?? '',
        preferredLanguage: profile.preferredLanguage ?? '',
      });
    }
  }, [profile]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        phone: form.phone || null,
        dateOfBirth: form.dateOfBirth || null,
        nationality: form.nationality || null,
        preferredCurrency: form.preferredCurrency || null,
        preferredLanguage: form.preferredLanguage || null,
      });
      toast.success('Profile updated', 'Your profile has been saved successfully.');
      setDirty(false);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Failed to update profile';
      toast.error('Update failed', msg);
    }
  };

  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'User';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Profile</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Update your personal information</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal/10 text-xl font-bold text-brand-teal">
            {(profile?.firstName?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-white">{displayName}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        </div>
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Personal Information</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Fields marked with * are required.</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Input label="First name *" placeholder="John" value={form.firstName} onChange={(e) => handleChange('firstName', e.target.value)} required autoComplete="given-name" />
          <Input label="Last name *" placeholder="Doe" value={form.lastName} onChange={(e) => handleChange('lastName', e.target.value)} required autoComplete="family-name" />
          <Input label="Phone" type="tel" placeholder="+1 234 567 890" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} autoComplete="tel" />
          <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => handleChange('dateOfBirth', e.target.value)} />
          <Input label="Nationality" placeholder="e.g. Saudi, Pakistani" value={form.nationality} onChange={(e) => handleChange('nationality', e.target.value)} />

          <Select label="Preferred currency" options={CURRENCIES} placeholder="Select currency" value={form.preferredCurrency} onChange={(e) => handleChange('preferredCurrency', e.target.value)} />
          <Select label="Preferred language" options={LANGUAGES} placeholder="Select language" value={form.preferredLanguage} onChange={(e) => handleChange('preferredLanguage', e.target.value)} />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button size="sm" disabled={!dirty || updateProfile.isPending}>
            {updateProfile.isPending ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Saving…
              </span>
            ) : 'Save changes'}
          </Button>
          {dirty && (
            <button type="button" onClick={() => {
              if (profile) {
                setForm({
                  firstName: profile.firstName ?? '',
                  lastName: profile.lastName ?? '',
                  phone: profile.phone ?? '',
                  dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '',
                  nationality: profile.nationality ?? '',
                  preferredCurrency: profile.preferredCurrency ?? '',
                  preferredLanguage: profile.preferredLanguage ?? '',
                });
                setDirty(false);
              }
            }} className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              Discard changes
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
