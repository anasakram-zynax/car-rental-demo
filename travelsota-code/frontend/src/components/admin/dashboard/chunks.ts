"use client";

// Shared code-split chunk for the admin dashboard's chart widgets.
//
// Every widget here pulls in Recharts, which is the heaviest dependency on
// the Dashboard tab. Re-exporting them from ONE barrel means Next.js places
// them in a single shared chunk instead of six near-identical ones — the
// browser downloads and parses Recharts once. The widgets were previously
// imported directly by `src/app/admin/page.tsx` with per-widget dynamic()
// paths, which produced one chunk per widget.
//
// Types are still imported from the source modules by the page (`import
// type`), so this barrel only carries the component runtime.

export { BookingsTrend } from "./ecommerce/bookings-trend";
export { RevenueBySource } from "./ecommerce/revenue-by-source";
export { CustomerInsights } from "./ecommerce/customer-insights";
export { PaymentStatusDistribution } from "./ecommerce/payment-status-distribution";
export { SalesTrend } from "./ecommerce/sales-trend";
export { TopDestinations } from "./ecommerce/top-destinations";
