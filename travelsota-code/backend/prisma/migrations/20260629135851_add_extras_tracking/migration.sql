-- Add extras tracking columns to FlightBooking
ALTER TABLE "FlightBooking"
  ADD COLUMN IF NOT EXISTS "extrasStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "extrasTotalAmount" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "extrasCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "lastExtrasSyncAt" TIMESTAMP(3);
