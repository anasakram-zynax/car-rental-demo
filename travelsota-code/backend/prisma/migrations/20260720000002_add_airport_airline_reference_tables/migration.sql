-- Create AirportReference table
CREATE TABLE "public"."AirportReference" (
    "id" TEXT NOT NULL,
    "iataCode" TEXT NOT NULL,
    "icaoCode" TEXT,
    "name" TEXT NOT NULL,
    "cityName" TEXT,
    "countryCode" TEXT,
    "countryName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "duffelCityId" TEXT,
    "duffelPlaceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'duffel',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirportReference_pkey" PRIMARY KEY ("id")
);

-- Create indexes for AirportReference
CREATE UNIQUE INDEX "AirportReference_iataCode_key" ON "public"."AirportReference"("iataCode");
CREATE INDEX "AirportReference_countryCode_idx" ON "public"."AirportReference"("countryCode");
CREATE INDEX "AirportReference_enabled_idx" ON "public"."AirportReference"("enabled");
CREATE INDEX "AirportReference_cityName_idx" ON "public"."AirportReference"("cityName");

-- Create AirlineReference table
CREATE TABLE "public"."AirlineReference" (
    "id" TEXT NOT NULL,
    "iataCode" TEXT NOT NULL,
    "icaoCode" TEXT,
    "name" TEXT NOT NULL,
    "countryCode" TEXT,
    "logoSymbolUrl" TEXT,
    "logoLockupUrl" TEXT,
    "conditionsOfCarriageUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'duffel',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirlineReference_pkey" PRIMARY KEY ("id")
);

-- Create indexes for AirlineReference
CREATE UNIQUE INDEX "AirlineReference_iataCode_key" ON "public"."AirlineReference"("iataCode");
CREATE INDEX "AirlineReference_countryCode_idx" ON "public"."AirlineReference"("countryCode");
CREATE INDEX "AirlineReference_enabled_idx" ON "public"."AirlineReference"("enabled");
