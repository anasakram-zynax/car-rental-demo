-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceBefore" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "paymentId" TEXT,
    "bookingId" TEXT,
    "bookingType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "applyTo" TEXT NOT NULL,
    "minAmount" DECIMAL(65,30),
    "maxAmount" DECIMAL(65,30),
    "agentTierId" TEXT,
    "agentId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRecord" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "ruleId" TEXT,
    "bookingAmount" DECIMAL(65,30) NOT NULL,
    "commissionAmount" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "rateType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payoutId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletHold" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "bookingId" TEXT,
    "bookingType" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditShell" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "remainingAmount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditShell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingModificationRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "refundAmount" DECIMAL(65,30),
    "cancellationFee" DECIMAL(65,30),
    "creditShellId" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingModificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDocument" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pdfData" BYTEA,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "emailedTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationFeeRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "applyTo" TEXT NOT NULL,
    "fee" DECIMAL(65,30) NOT NULL,
    "minFee" DECIMAL(65,30),
    "maxFee" DECIMAL(65,30),
    "supplierId" TEXT,
    "hoursSinceBooking" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletTransaction_agentProfileId_idx" ON "WalletTransaction"("agentProfileId");
CREATE INDEX "WalletTransaction_agentProfileId_createdAt_idx" ON "WalletTransaction"("agentProfileId", "createdAt");
CREATE INDEX "WalletTransaction_reference_idx" ON "WalletTransaction"("reference");

CREATE INDEX "CommissionRule_isActive_idx" ON "CommissionRule"("isActive");
CREATE INDEX "CommissionRule_applyTo_idx" ON "CommissionRule"("applyTo");
CREATE INDEX "CommissionRule_agentId_idx" ON "CommissionRule"("agentId");
CREATE INDEX "CommissionRule_agentTierId_idx" ON "CommissionRule"("agentTierId");

CREATE INDEX "CommissionRecord_agentProfileId_idx" ON "CommissionRecord"("agentProfileId");
CREATE INDEX "CommissionRecord_bookingId_idx" ON "CommissionRecord"("bookingId");
CREATE INDEX "CommissionRecord_status_idx" ON "CommissionRecord"("status");
CREATE INDEX "CommissionRecord_agentProfileId_status_idx" ON "CommissionRecord"("agentProfileId", "status");
CREATE INDEX "CommissionRecord_agentProfileId_createdAt_idx" ON "CommissionRecord"("agentProfileId", "createdAt");

CREATE INDEX "WalletHold_agentProfileId_idx" ON "WalletHold"("agentProfileId");
CREATE INDEX "WalletHold_bookingId_idx" ON "WalletHold"("bookingId");
CREATE INDEX "WalletHold_status_idx" ON "WalletHold"("status");

CREATE INDEX "CreditShell_agentProfileId_idx" ON "CreditShell"("agentProfileId");
CREATE INDEX "CreditShell_bookingId_idx" ON "CreditShell"("bookingId");
CREATE INDEX "CreditShell_status_idx" ON "CreditShell"("status");

CREATE INDEX "BookingModificationRequest_bookingId_bookingType_idx" ON "BookingModificationRequest"("bookingId", "bookingType");
CREATE INDEX "BookingModificationRequest_status_idx" ON "BookingModificationRequest"("status");

CREATE INDEX "DocumentTemplate_type_isDefault_idx" ON "DocumentTemplate"("type", "isDefault");

CREATE INDEX "BookingDocument_bookingId_bookingType_documentType_idx" ON "BookingDocument"("bookingId", "bookingType", "documentType");
CREATE INDEX "BookingDocument_status_idx" ON "BookingDocument"("status");

CREATE INDEX "CancellationFeeRule_applyTo_isActive_idx" ON "CancellationFeeRule"("applyTo", "isActive");
CREATE INDEX "CancellationFeeRule_supplierId_idx" ON "CancellationFeeRule"("supplierId");
