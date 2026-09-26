import type { Metadata } from 'next';
import { HotelDetailsPageClient } from './client';

export const metadata: Metadata = {
  title: 'Hotel Booking Details — TravelsOTA',
  description: 'Review your hotel details and enter guest information.',
};

export default async function HotelBookingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ rateId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { rateId } = await params;
  const query = await searchParams;

  const pick = (key: string) => {
    const val = query[key];
    return Array.isArray(val) ? val[0] : val;
  };

  return (
    <HotelDetailsPageClient
      rateId={rateId}
      rateKey={pick('rateKey')}
      hotelName={pick('hotelName')}
      roomName={pick('roomName')}
      boardName={pick('boardName')}
      price={Number(pick('price') ?? '0')}
      currency={pick('currency') ?? 'EUR'}
      checkIn={pick('checkIn')}
      checkOut={pick('checkOut')}
      roomAdults={pick('room_adults') ?? '1'}
      roomChildren={pick('room_children') ?? '0'}
      roomChildAges={pick('room_child_ages')}
      destination={pick('destination')}
      provider={pick('provider')}
      providerHotelId={pick('providerHotelId')}
      searchKey={pick('searchKey')}
      hotelId={pick('hotelId')}
      hotelImage={pick('hotelImage')}
      starRating={pick('starRating')}
      mode={(pick('mode') as 'customer' | 'agent') ?? 'customer'}
    />
  );
}
