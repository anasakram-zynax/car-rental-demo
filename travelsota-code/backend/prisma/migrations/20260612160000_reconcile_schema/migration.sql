-- Reconcile drift: columns added by prisma db push that were not in migration history

-- FlightBooking: add userId
ALTER TABLE "FlightBooking" ADD COLUMN "userId" TEXT;
ALTER TABLE "FlightBooking" ADD CONSTRAINT "FlightBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HotelBooking: add userId
ALTER TABLE "HotelBooking" ADD COLUMN "userId" TEXT;
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payment: add missing columns
ALTER TABLE "Payment" ADD COLUMN "cancelUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "successUrl" TEXT;

-- Payment: make idempotencyKey required + unique
UPDATE "Payment" SET "idempotencyKey" = gen_random_uuid()::text WHERE "idempotencyKey" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateTable: ProviderConfig (added after db push already created it, so IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "ProviderConfig" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "encryptedConfig" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on ProviderConfig
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConfig_module_provider_key" ON "ProviderConfig"("module", "provider");

-- AddForeignKey: ProviderConfig to User
ALTER TABLE "ProviderConfig" ADD CONSTRAINT "ProviderConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
