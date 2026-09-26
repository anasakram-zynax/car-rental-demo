import { Landmark, CalendarClock } from 'lucide-react';

/** Shared icons for the manual payment methods (Bank Transfer / Pay Later). */
export function BankTransferIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <Landmark className={className} strokeWidth={1.75} aria-hidden />;
}

export function PayLaterIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <CalendarClock className={className} strokeWidth={1.75} aria-hidden />;
}
