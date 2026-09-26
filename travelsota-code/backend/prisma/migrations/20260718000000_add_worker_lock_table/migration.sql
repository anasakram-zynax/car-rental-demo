-- CreateTable
CREATE TABLE "WorkerLock" (
    "lockKey" TEXT NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerLock_pkey" PRIMARY KEY ("lockKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerLock_lockKey_key" ON "WorkerLock"("lockKey");
