-- Bank-transfer receipt URL for manual hotel payment verification (admin issue flow).
-- No backfill: existing bookings simply have NULL (no receipt).
ALTER TABLE "HotelBooking" ADD COLUMN "receiptUrl" TEXT;
