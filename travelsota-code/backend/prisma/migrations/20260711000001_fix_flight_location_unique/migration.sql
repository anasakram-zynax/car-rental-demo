-- Manually fix FlightLocation unique constraint
-- Drop old single-column unique index
DROP INDEX IF EXISTS "FlightLocation_code_key";

-- Add compound unique constraint [code, type]
ALTER TABLE "FlightLocation" ADD CONSTRAINT "FlightLocation_code_type_key" UNIQUE ("code", "type");
