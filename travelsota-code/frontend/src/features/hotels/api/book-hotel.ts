import { apiRequest } from "@/lib/api/client";

export interface Pax {
  roomId: string;
  type: string;
  name: string;
  surname: string;
}

export interface Holder {
  name: string;
  surname: string;
}

export interface BookingInput {
  rateKey: string;
  clientReference: string;
  holder: Holder;
  paxes: Pax[];
}

export async function bookHotel(input: BookingInput) {
  return apiRequest("/hotels/book", {
    method: "POST",
    body: input,
    auth: true,
  });
}