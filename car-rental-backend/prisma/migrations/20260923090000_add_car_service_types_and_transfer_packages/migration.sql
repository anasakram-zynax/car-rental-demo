-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('rental', 'transfer');

-- AlterTable
ALTER TABLE "car"
ADD COLUMN "service_type" "ServiceType" NOT NULL DEFAULT 'rental',
ADD COLUMN "with_driver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "available_quantity" INTEGER NOT NULL DEFAULT 1;

-- Existing and future cars must always have at least one available unit.
ALTER TABLE "car"
ADD CONSTRAINT "car_available_quantity_check"
CHECK ("available_quantity" >= 1);

-- CreateTable
CREATE TABLE "car_transfer_package" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "from_location" TEXT NOT NULL,
    "to_location" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "car_transfer_package_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "car_transfer_package_price_check" CHECK ("price" > 0),
    CONSTRAINT "car_transfer_package_from_location_check" CHECK (length(btrim("from_location")) > 0),
    CONSTRAINT "car_transfer_package_to_location_check" CHECK (length(btrim("to_location")) > 0)
);

-- CreateIndex
CREATE INDEX "car_transfer_package_car_id_idx" ON "car_transfer_package"("car_id");

-- AddForeignKey
ALTER TABLE "car_transfer_package"
ADD CONSTRAINT "car_transfer_package_car_id_fkey"
FOREIGN KEY ("car_id") REFERENCES "car"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
