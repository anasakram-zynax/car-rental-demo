-- Flight autocomplete: airports, cities, and metro areas
CREATE TABLE "FlightLocation" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cityName" TEXT,
  "countryCode" TEXT,
  "countryName" TEXT,
  "iataCityCode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "timezone" TEXT,
  "aliases" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "popularityScore" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FlightLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlightLocation_code_key" ON "FlightLocation"("code");

CREATE INDEX "FlightLocation_type_idx" ON "FlightLocation"("type");

CREATE INDEX "FlightLocation_cityName_idx" ON "FlightLocation"("cityName");

CREATE INDEX "FlightLocation_countryCode_idx" ON "FlightLocation"("countryCode");

CREATE INDEX "FlightLocation_enabled_popularityScore_idx" ON "FlightLocation"("enabled", "popularityScore");
