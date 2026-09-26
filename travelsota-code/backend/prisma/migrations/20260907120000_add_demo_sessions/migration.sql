-- Demo session tracking (DEMO_LEADS_TRACKING_PLAN.md):
-- one row per demo-dashboard login; identity = visitorId (client UUID),
-- duration accumulated server-side from visibility-aware heartbeats.
CREATE TABLE "DemoSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "leadId" TEXT,
    "demoRole" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoSession_visitorId_idx" ON "DemoSession"("visitorId");
CREATE INDEX "DemoSession_loginAt_idx" ON "DemoSession"("loginAt");
CREATE INDEX "DemoSession_demoRole_idx" ON "DemoSession"("demoRole");
CREATE INDEX "DemoSession_leadId_idx" ON "DemoSession"("leadId");
