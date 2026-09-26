-- Admin performance indexes (loop Tabs 3-4): status/ref filters and sorts
-- across the bookings/users/payments tables that back every admin list and
-- the dashboard aggregates. Names match Prisma's default
-- `{Model}_{columns}_idx` convention so `prisma migrate dev` sees no drift.
-- Plain CREATE INDEX (repo convention; migrations run in a transaction where
-- CONCURRENTLY is illegal). Brief write lock per index on large tables —
-- apply off-peak if FlightBooking/HotelBooking exceed ~1M rows.
CREATE INDEX "User_userType_deletedAt_createdAt_idx" ON "User"("userType", "deletedAt", "createdAt");
CREATE INDEX "Payment_bookingType_status_idx" ON "Payment"("bookingType", "status");
CREATE INDEX "Payment_status_bookingType_currency_idx" ON "Payment"("status", "bookingType", "currency");
CREATE INDEX "FlightBooking_status_createdAt_idx" ON "FlightBooking"("status", "createdAt");
CREATE INDEX "FlightBooking_locatorCode_idx" ON "FlightBooking"("locatorCode");
CREATE INDEX "FlightBooking_publicRef_idx" ON "FlightBooking"("publicRef");
CREATE INDEX "FlightBooking_userId_idx" ON "FlightBooking"("userId");
CREATE INDEX "HotelBooking_status_createdAt_idx" ON "HotelBooking"("status", "createdAt");
CREATE INDEX "HotelBooking_publicRef_idx" ON "HotelBooking"("publicRef");
CREATE INDEX "HotelBooking_hotelbedsRef_idx" ON "HotelBooking"("hotelbedsRef");
CREATE INDEX "HotelBooking_clientReference_idx" ON "HotelBooking"("clientReference");
CREATE INDEX "HotelBooking_userId_idx" ON "HotelBooking"("userId");
