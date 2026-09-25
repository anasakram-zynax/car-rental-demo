-- AlterTable
ALTER TABLE "car_booking"
ADD COLUMN "transfer_package_id" UUID,
ALTER COLUMN "driver_birth_date" DROP NOT NULL,
ALTER COLUMN "driver_license_number" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "car_booking_transfer_package_id_idx"
ON "car_booking"("transfer_package_id");

-- AddForeignKey
ALTER TABLE "car_booking"
ADD CONSTRAINT "car_booking_transfer_package_id_fkey"
FOREIGN KEY ("transfer_package_id") REFERENCES "car_transfer_package"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
