-- AlterTable: Add missing columns to EmailRule
ALTER TABLE "EmailRule" ADD COLUMN "critical" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailRule" ADD COLUMN "sendToRoles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "EmailRule" ADD COLUMN "templateKey" TEXT;
ALTER TABLE "EmailRule" ADD COLUMN "description" TEXT;

-- Drop the stale `name` column that was in the original migration but not in the current schema
ALTER TABLE "EmailRule" DROP COLUMN "name";

-- AlterTable: Add retryCount to EmailMessage
ALTER TABLE "EmailMessage" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Rename error to lastError in EmailRecipient
ALTER TABLE "EmailRecipient" RENAME COLUMN "error" TO "lastError";

-- Fix: EmailRecipient and EmailDeliveryAttempt have updatedAt NOT NULL from original migration
-- but the current Prisma schema omits this field. Make nullable so Prisma INSERTs succeed.
ALTER TABLE "EmailRecipient" ALTER COLUMN "updatedAt" DROP NOT NULL;
ALTER TABLE "EmailDeliveryAttempt" ALTER COLUMN "updatedAt" DROP NOT NULL;
