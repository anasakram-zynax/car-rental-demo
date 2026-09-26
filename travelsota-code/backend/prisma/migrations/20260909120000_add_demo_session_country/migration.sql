-- DemoSession.country: ISO 3166-1 alpha-2 from best-effort IP geolocation
-- (used by the admin demo-leads globe + country leaderboard).
ALTER TABLE "DemoSession" ADD COLUMN "country" TEXT;
