import type { TravelSuggestion } from '@/features/autocomplete/types';

export interface RoomForm {
  adults: string;
  children: string;
  childAges: string;
}

export interface FormState {
  checkIn: string;
  checkOut: string;

  /** Display text for the destination input */
  destinationName: string;
  /** The resolved destination code (e.g. 'DXB', 'BCN') from autocomplete */
  selectedDestinationCode: string;
  /** Full suggestion object for the selected destination, if any */
  selectedDestination: TravelSuggestion | null;

  /** Display text for the hotel name input (only populated when searching by hotel) */
  hotelName: string;
  /** Full suggestion object for the selected hotel, if any */
  selectedHotel: TravelSuggestion | null;

  roomsList: RoomForm[];

  /** Nationality / country of residence */
  nationality: string;
}