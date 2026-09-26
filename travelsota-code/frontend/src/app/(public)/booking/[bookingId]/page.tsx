'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BookingLayout } from '@/components/booking/booking-layout';
import { UnifiedBookingStatus } from '@/components/booking/unified-booking-status';

export default function BookingStatusPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const router = useRouter();
  const tCheckout = useTranslations('Checkout');
  const [bookingId, setBookingId] = useState<string>('');

  useEffect(() => {
    params.then(({ bookingId }) => setBookingId(bookingId));
  }, [params]);

  if (!bookingId) {
    return (
      <BookingLayout backHref="/" backLabel={tCheckout('homeAction')}>
        <p className="text-sm text-zinc-500">{tCheckout('loadingBookingStatus')}</p>
      </BookingLayout>
    );
  }

  return (
    <BookingLayout backHref="/my-bookings" backLabel={tCheckout('myBookingsAction')}>
      <UnifiedBookingStatus bookingId={bookingId} />
    </BookingLayout>
  );
}
