import type { HotelRateView } from "@/lib/schema/hotel";

export interface SelectedRate {
  hotelId: string;
  hotelName: string;
  currency?: string;
  rate: HotelRateView;
}