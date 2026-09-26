'use client';

import { FlightDetailsView } from '@/components/booking/flight-details-view';

interface FlightDetailsPageClientProps {
  offerId: string;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  price: number;
  currency: string;
  productId?: string;
  productIds?: string[];
  productSelections?: Array<{ offeringId: string; productIds: string[] }>;
  catalogUuid?: string;
  offeringIdentifierValue?: string;
  brandOfferingId?: string;
  tripType?: 'one_way' | 'round_trip';
  returnDate?: string;
  adults: number;
  searchKey?: string;
  provider?: string;
  agentOriginalPrice?: number;
  agentMarkedUpPrice?: number;
  agentMarkupPercent?: number;
  mode?: 'customer' | 'agent';
  returnOfferId?: string;
  returnProductId?: string;
  returnProductIds?: string[];
  returnCatalogUuid?: string;
  returnProductSelections?: Array<{ offeringId: string; productIds: string[] }>;
  baggageLabel?: string;
}

export function FlightDetailsPageClient(props: FlightDetailsPageClientProps) {
  return <FlightDetailsView {...props} />;
}
