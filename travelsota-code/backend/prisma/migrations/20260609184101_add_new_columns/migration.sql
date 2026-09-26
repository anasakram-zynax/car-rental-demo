-- AlterTable
ALTER TABLE "FlightBooking" ADD COLUMN     "amount" DOUBLE PRECISION,
ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "HotelBooking" ADD COLUMN     "amount" DOUBLE PRECISION,
ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT;
