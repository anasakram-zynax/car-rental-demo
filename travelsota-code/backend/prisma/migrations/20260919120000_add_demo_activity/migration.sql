-- DemoActivity: what demo visitors did during their session — tabs opened
-- ('page', reported by the tracker) and API endpoints called ('api',
-- captured by DemoActivityInterceptor). Pruned with the same retention
-- policy as DemoSession.
CREATE TABLE "DemoActivity" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoActivity_sessionId_createdAt_idx" ON "DemoActivity"("sessionId", "createdAt");
CREATE INDEX "DemoActivity_visitorId_createdAt_idx" ON "DemoActivity"("visitorId", "createdAt");
