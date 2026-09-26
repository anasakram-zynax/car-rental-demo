-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "commissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "flightCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hotelCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "packageCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "minMonthlyBookings" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AgentProfile"
  ADD COLUMN "parentAgentId" TEXT,
  ADD COLUMN "walletBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "commissionTierId" TEXT,
  ADD COLUMN "markupRules" JSONB,
  ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "kycDocuments" JSONB,
  ADD COLUMN "branding" JSONB,
  ADD COLUMN "autoSuspendThreshold" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "isSuspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suspensionReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_name_key" ON "CommissionTier"("name");

-- CreateIndex
CREATE INDEX "AgentProfile_parentAgentId_idx" ON "AgentProfile"("parentAgentId");

-- CreateIndex
CREATE INDEX "AgentProfile_kycStatus_idx" ON "AgentProfile"("kycStatus");

-- CreateIndex
CREATE INDEX "AgentProfile_isSuspended_idx" ON "AgentProfile"("isSuspended");

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_parentAgentId_fkey" FOREIGN KEY ("parentAgentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_commissionTierId_fkey" FOREIGN KEY ("commissionTierId") REFERENCES "CommissionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
