-- Payment table had ZERO indexes: every admin bookings-list request
-- full-scanned Payment (twice — flight + hotel mapping) to resolve
-- paymentStatus/amount, and the table grows with every booking.
CREATE INDEX "Payment_bookingId_bookingType_idx" ON "Payment"("bookingId", "bookingType");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
