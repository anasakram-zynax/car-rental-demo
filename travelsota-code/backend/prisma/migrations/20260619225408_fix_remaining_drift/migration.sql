-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'REQUIRES_ACTION');

-- AlterTable
ALTER TABLE "CommissionRecord" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "FlightBooking" ADD COLUMN     "baseAmount" DOUBLE PRECISION,
ADD COLUMN     "workflowSummary" JSONB;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "status",
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
