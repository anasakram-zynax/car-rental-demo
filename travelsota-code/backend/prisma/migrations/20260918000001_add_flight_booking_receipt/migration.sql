-- Bank-transfer receipt URL for manual payment verification (admin issue flow).
-- No backfill: existing bookings simply have NULL (no receipt).
ALTER TABLE "FlightBooking" ADD COLUMN "receiptUrl" TEXT;
