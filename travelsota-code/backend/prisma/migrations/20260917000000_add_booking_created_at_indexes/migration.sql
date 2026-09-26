-- Bare createdAt indexes for the admin bookings list: the merged
-- flights+hotels feed orders by createdAt DESC over arbitrary WHERE
-- combinations, so every page request needs a fast reverse scan on each
-- table (previously: full table scan per request).
CREATE INDEX "FlightBooking_createdAt_idx" ON "FlightBooking"("createdAt");
CREATE INDEX "HotelBooking_createdAt_idx" ON "HotelBooking"("createdAt");
