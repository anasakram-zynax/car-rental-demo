-- Add human-friendly booking reference (TQ-XXXX-XXXX) for support calls.
ALTER TABLE "FlightBooking" ADD COLUMN "publicRef" TEXT;
ALTER TABLE "HotelBooking" ADD COLUMN "publicRef" TEXT;

CREATE UNIQUE INDEX "FlightBooking_publicRef_key" ON "FlightBooking"("publicRef");
CREATE UNIQUE INDEX "HotelBooking_publicRef_key" ON "HotelBooking"("publicRef");

-- Backfill existing rows with an unambiguous 8-char code from md5 hex
-- (hex only contains 0-9a-f, which are all in the speakable alphabet).
UPDATE "FlightBooking"
SET "publicRef" = 'TQ-' || UPPER(SUBSTRING(MD5(RANDOM()::text || id), 1, 4)) || '-' || UPPER(SUBSTRING(MD5(RANDOM()::text || id), 5, 4))
WHERE "publicRef" IS NULL;

UPDATE "HotelBooking"
SET "publicRef" = 'TQ-' || UPPER(SUBSTRING(MD5(RANDOM()::text || id), 1, 4)) || '-' || UPPER(SUBSTRING(MD5(RANDOM()::text || id), 5, 4))
WHERE "publicRef" IS NULL;
