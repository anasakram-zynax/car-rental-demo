-- CreateTable
CREATE TABLE "FlightBooking" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'travelport',
    "status" TEXT NOT NULL,
    "offerSnapshot" JSONB NOT NULL,
    "travelerSnapshot" JSONB NOT NULL,
    "workbenchId" TEXT,
    "reservationId" TEXT,
    "locatorCode" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlightBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBooking" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'hotelbeds',
    "status" TEXT NOT NULL,
    "rateKey" TEXT NOT NULL,
    "holder" JSONB NOT NULL,
    "clientReference" TEXT NOT NULL,
    "paxes" JSONB NOT NULL,
    "hotelbedsRef" TEXT,
    "hotelbedsStatus" TEXT,
    "hotelSnapshot" JSONB,
    "priceSnapshot" JSONB,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBooking_pkey" PRIMARY KEY ("id")
);
