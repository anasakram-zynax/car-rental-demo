"use client";
import { useTranslations } from 'next-intl';


import { Input } from "@/components/ui/input";

interface GuestFormSectionProps {
  index: number;
  roomLabel: string;
  isLead: boolean;
  guestName: string;
  guestLastName: string;
  guestTitle: string;
  onNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
}

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof"];

export function GuestFormSection({
  index,
  roomLabel,
  isLead,
  guestName,
  guestLastName,
  guestTitle,
  onNameChange,
  onLastNameChange,
  onTitleChange,
}: GuestFormSectionProps) {
  const t = useTranslations('Checkout');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-charcoal">
          {isLead ? "Adult 1 (Lead Traveler)" : index === 1 ? "Adult 2" : `Guest ${index + 1}`}
        </h3>
        {roomLabel ? (
          <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">{roomLabel}</span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-600">Title</label>
          <select
            value={guestTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-charcoal focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20"
          >
            <option value="">Select</option>
            {TITLES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Input label="First name *" placeholder="First name" value={guestName} onChange={(e) => onNameChange(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Input label="Last name *" placeholder="Last name" value={guestLastName} onChange={(e) => onLastNameChange(e.target.value)} />
        </div>
      </div>

      {isLead ? (
        <p className="text-[11px] text-zinc-400 italic">
          To change the lead traveler details, check &quot;I&apos;m making this booking for someone else&quot; above.
        </p>
      ) : null}
    </div>
  );
}
