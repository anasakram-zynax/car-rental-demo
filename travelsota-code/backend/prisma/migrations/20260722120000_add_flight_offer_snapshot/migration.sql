-- CreateTable
CREATE TABLE "public"."FlightOfferSnapshot" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "searchKey" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "tripType" TEXT NOT NULL DEFAULT 'one_way',
    "contentSource" TEXT,
    "supplierContext" JSONB NOT NULL,
    "normalizedOffer" JSONB NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlightOfferSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlightOfferSnapshot_userId_idx" ON "public"."FlightOfferSnapshot"("userId");

-- CreateIndex
CREATE INDEX "FlightOfferSnapshot_searchKey_offerId_idx" ON "public"."FlightOfferSnapshot"("searchKey", "offerId");

-- AddForeignKey
ALTER TABLE "public"."FlightOfferSnapshot" ADD CONSTRAINT "FlightOfferSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "public"."FlightBooking" ADD COLUMN IF NOT EXISTS "snapshotId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."FlightBooking" ADD CONSTRAINT "FlightBooking_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."FlightOfferSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
