'use client';

import { HotelDetailsView } from '@/components/booking/hotel-details-view';

interface HotelDetailsPageClientProps {
  rateId: string;
  rateKey?: string;
  hotelName?: string;
  roomName?: string;
  boardName?: string;
  price: number;
  currency: string;
  checkIn?: string;
  checkOut?: string;
  roomAdults: string;
  roomChildren: string;
  roomChildAges?: string;
  destination?: string;
  provider?: string;
  providerHotelId?: string;
  searchKey?: string;
  hotelId?: string;
  hotelImage?: string;
  starRating?: string;
  mode?: 'customer' | 'agent';
}

export function HotelDetailsPageClient(props: HotelDetailsPageClientProps) {
  return <HotelDetailsView {...props} />;
}
