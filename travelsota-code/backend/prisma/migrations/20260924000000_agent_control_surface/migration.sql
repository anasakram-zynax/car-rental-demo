-- Admin control surface: per-agent supplier + gateway allowlists.
-- NULL (or empty array) means all enabled suppliers/gateways allowed.
ALTER TABLE "AgentProfile" ADD COLUMN "allowedFlightProviders" JSONB;
ALTER TABLE "AgentProfile" ADD COLUMN "allowedHotelProviders" JSONB;
ALTER TABLE "AgentProfile" ADD COLUMN "allowedGateways" JSONB;
