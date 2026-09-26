-- Dual hold windows: supplier-side hold deadline vs admin-set hold deadline.
-- holdExpiresAt remains the EFFECTIVE deadline (min of the two) that the
-- expiry cron sweeps on. Existing rows keep their current effective value;
-- the two source columns start NULL (unknown) and fill in on new holds.
ALTER TABLE "FlightBooking" ADD COLUMN "supplierHoldExpiresAt" TIMESTAMPTZ;
ALTER TABLE "FlightBooking" ADD COLUMN "adminHoldExpiresAt" TIMESTAMPTZ;
CREATE INDEX "FlightBooking_holdExpiresAt_idx" ON "FlightBooking"("holdExpiresAt");
