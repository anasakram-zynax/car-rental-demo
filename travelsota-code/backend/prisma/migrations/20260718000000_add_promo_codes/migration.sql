-- CreateEnum
CREATE TYPE "PromoCodeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PromoCustomerType" AS ENUM ('ALL', 'CUSTOMER', 'AGENT');

-- CreateEnum
CREATE TYPE "PromoRedemptionStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED', 'VOIDED', 'REFUNDED');

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PromoCodeStatus" NOT NULL DEFAULT 'DRAFT',
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValueMinor" INTEGER NOT NULL,
    "discountPercentBps" INTEGER,
    "maxDiscountMinor" INTEGER,
    "minBookingAmountMinor" INTEGER,
    "currency" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT DEFAULT 'UTC',
    "totalUsageLimit" INTEGER,
    "perUserLimit" INTEGER DEFAULT 1,
    "firstBookingOnly" BOOLEAN NOT NULL DEFAULT false,
    "customerType" "PromoCustomerType" NOT NULL DEFAULT 'ALL',
    "productTypes" TEXT[] DEFAULT ARRAY['flights', 'hotels'],
    "eligibleRoutes" TEXT[],
    "eligibleAirlines" TEXT[],
    "eligibleCabins" TEXT[],
    "eligibleHotelIds" TEXT[],
    "eligibleDestinations" TEXT[],
    "excludedProviders" TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmailHash" TEXT,
    "bookingId" TEXT,
    "bookingType" TEXT,
    "paymentId" TEXT,
    "status" "PromoRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "discountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "bookingSubtotalMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoAuditLog" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_status_idx" ON "PromoCode"("status");

-- CreateIndex
CREATE INDEX "PromoCode_startsAt_endsAt_idx" ON "PromoCode"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PromoCode_createdById_idx" ON "PromoCode"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_idempotencyKey_key" ON "PromoRedemption"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "unique_promo_per_booking" ON "PromoRedemption"("promoCodeId", "bookingId");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoCodeId_status_idx" ON "PromoRedemption"("promoCodeId", "status");

-- CreateIndex
CREATE INDEX "PromoRedemption_userId_promoCodeId_status_idx" ON "PromoRedemption"("userId", "promoCodeId", "status");

-- CreateIndex
CREATE INDEX "PromoRedemption_bookingId_idx" ON "PromoRedemption"("bookingId");

-- CreateIndex
CREATE INDEX "PromoRedemption_expiresAt_idx" ON "PromoRedemption"("expiresAt");

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
