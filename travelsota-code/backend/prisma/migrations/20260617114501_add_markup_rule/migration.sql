-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "permissionOverrides" JSONB;

-- CreateTable
CREATE TABLE "MarkupRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "applyTo" TEXT NOT NULL,
    "markupType" TEXT NOT NULL,
    "markupValue" DECIMAL(65,30) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "agentId" TEXT,
    "supplierId" TEXT,
    "routeFrom" TEXT,
    "routeTo" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkupRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarkupRule_type_idx" ON "MarkupRule"("type");

-- CreateIndex
CREATE INDEX "MarkupRule_applyTo_idx" ON "MarkupRule"("applyTo");

-- CreateIndex
CREATE INDEX "MarkupRule_agentId_idx" ON "MarkupRule"("agentId");

-- CreateIndex
CREATE INDEX "MarkupRule_priority_idx" ON "MarkupRule"("priority");

-- CreateIndex
CREATE INDEX "MarkupRule_isActive_idx" ON "MarkupRule"("isActive");

-- CreateIndex
CREATE INDEX "MarkupRule_agentId_applyTo_isActive_idx" ON "MarkupRule"("agentId", "applyTo", "isActive");
