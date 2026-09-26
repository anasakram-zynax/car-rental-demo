CREATE TABLE "public"."ManualHotel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "hotelOrder" INTEGER NOT NULL DEFAULT 0,
  "stars" INTEGER,
  "rating" DOUBLE PRECISION,
  "accommodationType" TEXT,
  "description" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "discount" DOUBLE PRECISION,
  "refundable" BOOLEAN NOT NULL DEFAULT false,
  "checkinTime" TEXT NOT NULL DEFAULT '14:00',
  "checkoutTime" TEXT NOT NULL DEFAULT '12:00',
  "bookingAgeRequirement" INTEGER NOT NULL DEFAULT 18,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "location" TEXT NOT NULL,
  "address" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "metaTitle" TEXT,
  "metaKeywords" TEXT,
  "metaDesc" TEXT,
  "cancellationPolicy" TEXT,
  "privacyPolicy" TEXT,
  "amenities" JSONB,
  "images" JSONB,
  "translations" JSONB,
  "destinationCode" TEXT,
  "destinationName" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManualHotel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualHotel_slug_key" ON "public"."ManualHotel"("slug");
CREATE INDEX "ManualHotel_status_idx" ON "public"."ManualHotel"("status");
CREATE INDEX "ManualHotel_destinationCode_status_idx" ON "public"."ManualHotel"("destinationCode", "status");
CREATE INDEX "ManualHotel_featured_status_hotelOrder_idx" ON "public"."ManualHotel"("featured", "status", "hotelOrder");
CREATE INDEX "ManualHotel_slug_idx" ON "public"."ManualHotel"("slug");

CREATE TABLE "public"."ManualHotelRoom" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roomType" TEXT,
  "description" TEXT,
  "maxAdults" INTEGER NOT NULL DEFAULT 2,
  "maxChildren" INTEGER NOT NULL DEFAULT 0,
  "basePrice" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "discountPercent" DOUBLE PRECISION,
  "extraBedAvailable" BOOLEAN NOT NULL DEFAULT false,
  "extraBedCharge" DOUBLE PRECISION,
  "breakfastIncluded" BOOLEAN NOT NULL DEFAULT false,
  "cancellationFree" BOOLEAN NOT NULL DEFAULT false,
  "refundable" BOOLEAN NOT NULL DEFAULT false,
  "availableQuantity" INTEGER NOT NULL DEFAULT 1,
  "boardType" TEXT,
  "amenities" JSONB,
  "images" JSONB,
  "translations" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManualHotelRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManualHotelRoom_hotelId_idx" ON "public"."ManualHotelRoom"("hotelId");
CREATE INDEX "ManualHotelRoom_hotelId_status_idx" ON "public"."ManualHotelRoom"("hotelId", "status");

ALTER TABLE "public"."ManualHotelRoom" ADD CONSTRAINT "ManualHotelRoom_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "public"."ManualHotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
