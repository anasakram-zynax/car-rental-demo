-- Receipt/proof URL for offline wallet top-up requests.
ALTER TABLE "WalletTransaction" ADD COLUMN "evidenceUrl" TEXT;
