import { useTranslations } from 'next-intl';
import React from "react";

interface Props {
  booking: any;
}

export function BookingConfirmationCard({ booking }: Props) {
  const t = useTranslations('Checkout');
  if (!booking) return null;

  const hotel = booking.hotel;
  const holder = booking.holder;
  const rooms = booking.rooms ?? [];
  const price = booking.price;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">

      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Booking Reference
          </p>
          <h2 className="text-2xl font-bold text-zinc-900">
            {booking.reference}
          </h2>
          <p className="text-sm text-zinc-500">
            Client: {booking.clientReference}
          </p>
        </div>

        <div className="text-right">
          <span className={`text-xs px-3 py-1 rounded-full ${
            booking.cancellationAllowed
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}>
            {booking.cancellationAllowed ? "Cancellable" : "Non-refundable"}
          </span>
        </div>
      </div>

      {/* HOTEL */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-zinc-700 mb-2">
          Hotel Details
        </h3>

        <div className="text-zinc-900 font-medium">
          {hotel?.name}
        </div>

        <div className="text-sm text-zinc-500 mt-1">
          {hotel?.destinationName} • {hotel?.zoneName}
        </div>

        <div className="text-sm text-zinc-500 mt-1">
          {hotel?.checkIn} → {hotel?.checkOut}
        </div>
      </div>

      {/* HOLDER */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-zinc-700 mb-2">
          Main Guest
        </h3>

        <p className="text-zinc-900">
          {holder?.name} {holder?.surname}
        </p>
      </div>

      {/* ROOMS */}
      <div className="border-t pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-700">
          Rooms & Guests
        </h3>

        {rooms.map((room: any, idx: number) => (
          <div
            key={idx}
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
          >
            <div className="flex justify-between">
              <p className="font-medium text-zinc-900">
                {room.name}
              </p>
              <span className="text-xs text-zinc-500">
                {room.status}
              </span>
            </div>

            {/* PAX */}
            <div className="mt-3 space-y-1">
              {room.paxes?.map((pax: any, i: number) => (
                <div
                  key={i}
                  className="text-sm text-zinc-700 flex justify-between"
                >
                  <span>
                    {pax.type === "AD" ? "Adult" : "Child"}
                  </span>
                  <span>
                    {pax.name || "-"} {pax.surname || ""}
                  </span>
                </div>
              ))}
            </div>

            {/* RATE */}
            <div className="mt-3 text-sm text-zinc-600">
              <div>
                Board: {room.rates?.[0]?.boardName}
              </div>
              <div>
                Payment: {room.rates?.[0]?.paymentType}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PRICE */}
      <div className="border-t pt-4 flex justify-between items-center">
        <span className="text-sm text-zinc-600">
          Total Price
        </span>

        <span className="text-xl font-bold text-zinc-900">
          {price?.totalNet} {price?.currency}
        </span>
      </div>
    </div>
  );
}