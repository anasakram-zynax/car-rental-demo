-- FlightBooking.rateSnapshot: display currency + exchange rate used at
-- booking-creation time (mirrors HotelBooking.rateSnapshot.chargeExchangeRate)
-- so refunds/invoices can reconstruct the exact amount shown to the customer
-- without re-converting against today's possibly-different rate.
ALTER TABLE "FlightBooking" ADD COLUMN "rateSnapshot" JSONB;
