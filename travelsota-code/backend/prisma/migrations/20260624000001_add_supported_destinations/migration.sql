-- Create SupportedHotelDestination table
CREATE TABLE "SupportedHotelDestination" (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "countryCode" TEXT,
    "countryName" TEXT,
    "cityName" TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    enabled BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "searchAliases" JSONB,
    "contentStatus" TEXT NOT NULL DEFAULT 'missing',
    "lastContentSyncAt" TIMESTAMP(3),
    "contentCoverage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportedHotelDestination_pkey" PRIMARY KEY (id),
    CONSTRAINT "SupportedHotelDestination_code_key" UNIQUE (code)
);
-- Create SupportedHotelDestinationProvider table
CREATE TABLE "SupportedHotelDestinationProvider" (
    id TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "providerCodeType" TEXT NOT NULL DEFAULT 'destination_code',
    enabled BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'missing',
    "syncErrorText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportedHotelDestinationProvider_pkey" PRIMARY KEY (id),
    CONSTRAINT "SupportedHotelDestinationProvider_destinationId_provider_key" UNIQUE ("destinationId", provider)
);

-- Foreign key
ALTER TABLE "SupportedHotelDestinationProvider" ADD CONSTRAINT "SupportedHotelDestinationProvider_destinationId_fkey"
    FOREIGN KEY ("destinationId") REFERENCES "SupportedHotelDestination"(id) ON DELETE CASCADE;

-- Indexes for SupportedHotelDestination
CREATE INDEX "idx_supported_destination_enabled_order"
    ON "SupportedHotelDestination" (enabled, "displayOrder");
CREATE INDEX "idx_supported_destination_normalized_name"
    ON "SupportedHotelDestination" ("normalizedName");
CREATE INDEX "idx_supported_destination_country_code"
    ON "SupportedHotelDestination" ("countryCode");
CREATE INDEX "idx_supported_destination_content_status"
    ON "SupportedHotelDestination" ("contentStatus");

-- Indexes for SupportedHotelDestinationProvider
CREATE INDEX "idx_supported_destination_provider_code"
    ON "SupportedHotelDestinationProvider" (provider, "providerCode");
CREATE INDEX "idx_supported_destination_provider_enabled_sync"
    ON "SupportedHotelDestinationProvider" (enabled, "syncStatus");

-- Enable pg_trgm for fuzzy name matching (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for destination name search
CREATE INDEX IF NOT EXISTS idx_supported_destination_name_trgm
    ON "SupportedHotelDestination"
    USING gin ("normalizedName" gin_trgm_ops);
