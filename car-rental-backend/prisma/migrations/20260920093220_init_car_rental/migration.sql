-- CreateEnum
CREATE TYPE "CarStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'paid', 'refunded');

-- CreateTable
CREATE TABLE "car_type" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "car_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "car_type_id" UUID NOT NULL,
    "transmission" TEXT NOT NULL,
    "fuel_type" TEXT NOT NULL,
    "doors" INTEGER NOT NULL DEFAULT 4,
    "passengers" INTEGER NOT NULL DEFAULT 5,
    "baggage" INTEGER NOT NULL DEFAULT 2,
    "amenities" TEXT[],
    "city" TEXT NOT NULL,
    "daily_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "is_refundable" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "CarStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "car_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_image" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "car_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_booking" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "car_id" UUID NOT NULL,
    "pickup_location" TEXT NOT NULL,
    "dropoff_location" TEXT NOT NULL,
    "pickup_at" TIMESTAMPTZ NOT NULL,
    "return_at" TIMESTAMPTZ NOT NULL,
    "rental_days" INTEGER NOT NULL,
    "daily_price" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "booking_status" "BookingStatus" NOT NULL DEFAULT 'confirmed',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "cancel_reason" TEXT,
    "driver_first_name" TEXT NOT NULL,
    "driver_last_name" TEXT NOT NULL,
    "driver_birth_date" DATE NOT NULL,
    "driver_license_number" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "special_requests" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "car_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "car_type_label_key" ON "car_type"("label");

-- CreateIndex
CREATE UNIQUE INDEX "car_slug_key" ON "car"("slug");

-- CreateIndex
CREATE INDEX "car_city_idx" ON "car"("city");

-- CreateIndex
CREATE INDEX "car_car_type_id_idx" ON "car"("car_type_id");

-- CreateIndex
CREATE INDEX "car_status_idx" ON "car"("status");

-- CreateIndex
CREATE INDEX "car_image_car_id_idx" ON "car_image"("car_id");

-- CreateIndex
CREATE UNIQUE INDEX "car_booking_reference_key" ON "car_booking"("reference");

-- CreateIndex
CREATE INDEX "car_booking_car_id_idx" ON "car_booking"("car_id");

-- CreateIndex
CREATE INDEX "car_booking_booking_status_idx" ON "car_booking"("booking_status");

-- CreateIndex
CREATE INDEX "car_booking_payment_status_idx" ON "car_booking"("payment_status");

-- CreateIndex
CREATE INDEX "car_booking_pickup_at_return_at_idx" ON "car_booking"("pickup_at", "return_at");

-- AddForeignKey
ALTER TABLE "car" ADD CONSTRAINT "car_car_type_id_fkey" FOREIGN KEY ("car_type_id") REFERENCES "car_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_image" ADD CONSTRAINT "car_image_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_booking" ADD CONSTRAINT "car_booking_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
