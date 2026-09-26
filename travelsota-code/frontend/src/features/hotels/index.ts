export { searchHotels } from './api/search-hotels';
export type { HotelSearchInput, HotelOccupancyInput, HotelGeolocationInput } from './api/search-hotels';

export { checkRateApi } from './api/check-rate';
export type { CheckRateInput, CheckRateResponse } from './api/check-rate';

export { validateRateApi } from './api/validate-rate';
export type { ValidateRateInput, ValidateRateResponse } from './api/validate-rate';

export { bookHotel } from './api/book-hotel';
export type { BookingInput, Pax, Holder } from './api/book-hotel';

export { hotelCheckout } from './api/hotel-checkout';
export type { HotelCheckoutInput, HotelCheckoutResponse, HotelCheckoutHolder, HotelCheckoutPax } from './api/hotel-checkout';

export { getHotelBooking } from './api/get-booking';
export type { HotelBookingDetailResponse } from './api/get-booking';

export { HotelSearchForm } from './components/hotel-search-form';
export { HotelResultCard } from './components/hotel-result-card';
export { HotelOfferForm } from './components/hotel-offer-form';
export { BookingConfirmationCard } from './components/booking-results';

// New room component tree (Phase B)
export { RoomList, RoomCard, RateList, RateCard, RoomFilterBar, FilterChip, Accordion } from './components/room';
export { buildRoomView } from './components/room/room-view-model';
export type { GroupedRoom } from './api/get-hotel-details';

export { useHotelSearch, useHotelCheckRate, useHotelBook, useHotelCheckout, useHotelBooking } from './hooks';

export type { RoomForm, FormState } from './types/search-form';
export type { SelectedRate } from './types/selected-rate';

export { getSelectedRate, saveSelectedRate } from './helper.hotels';
