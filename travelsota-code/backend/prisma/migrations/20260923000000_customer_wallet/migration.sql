-- Customer wallet: prepaid ledger for customers, reusing the unified
-- WalletTransaction / WalletHold tables alongside agent rows.
-- Owner columns are now nullable with exactly one owner set per row:
-- agent rows keep agentProfileId, customer rows use userId.
-- User carries its own prepaid balance (no credit line for customers).
ALTER TABLE "User" ADD COLUMN "walletBalance" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "walletCurrency" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "WalletTransaction" ALTER COLUMN "agentProfileId" DROP NOT NULL;
ALTER TABLE "WalletTransaction" ADD COLUMN "userId" TEXT;
CREATE INDEX "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");

ALTER TABLE "WalletHold" ALTER COLUMN "agentProfileId" DROP NOT NULL;
ALTER TABLE "WalletHold" ADD COLUMN "userId" TEXT;
CREATE INDEX "WalletHold_userId_idx" ON "WalletHold"("userId");
