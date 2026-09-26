-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'AUTHORIZED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "captureMethod" TEXT;
