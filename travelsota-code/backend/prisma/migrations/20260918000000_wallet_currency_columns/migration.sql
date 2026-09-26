-- Wallet currency columns: single-currency ledger per agent.
-- AgentProfile.walletCurrency owns the domain (default USD, matches all
-- existing balances). Transaction/hold/shell rows stamp the currency their
-- amounts are denominated in; existing rows are all wallet-domain already,
-- so backfilling USD preserves current semantics exactly.
ALTER TABLE "AgentProfile" ADD COLUMN "walletCurrency" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "WalletTransaction" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "WalletTransaction" ADD COLUMN "originalAmount" DECIMAL;
ALTER TABLE "WalletTransaction" ADD COLUMN "originalCurrency" TEXT;

ALTER TABLE "WalletHold" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "CreditShell" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
