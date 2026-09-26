-- Invoice management foundation.
-- Additive migration: existing voucher/invoice documents continue to work.

ALTER TABLE "BookingDocument"
  ADD COLUMN "docSubType" TEXT,
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "creditNoteNumber" TEXT,
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "userType" TEXT,
  ADD COLUMN "paymentId" TEXT,
  ADD COLUMN "amount" DECIMAL(12,2),
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "taxAmount" DECIMAL(12,2),
  ADD COLUMN "taxRate" DECIMAL(5,2),
  ADD COLUMN "markupAmount" DECIMAL(12,2),
  ADD COLUMN "commissionAmount" DECIMAL(12,2),
  ADD COLUMN "viewedAt" TIMESTAMP(3),
  ADD COLUMN "relatedToId" TEXT,
  ADD COLUMN "generatedById" TEXT,
  ADD COLUMN "metadata" JSONB;

CREATE TABLE "InvoiceSequence" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceSequence_year_entityType_documentType_key"
  ON "InvoiceSequence"("year", "entityType", "documentType");

CREATE INDEX "InvoiceSequence_year_entityType_documentType_idx"
  ON "InvoiceSequence"("year", "entityType", "documentType");

CREATE UNIQUE INDEX "BookingDocument_invoiceNumber_key"
  ON "BookingDocument"("invoiceNumber");

CREATE UNIQUE INDEX "BookingDocument_creditNoteNumber_key"
  ON "BookingDocument"("creditNoteNumber");

CREATE INDEX "BookingDocument_userId_documentType_createdAt_idx"
  ON "BookingDocument"("userId", "documentType", "createdAt");

CREATE INDEX "BookingDocument_invoiceNumber_idx"
  ON "BookingDocument"("invoiceNumber");

CREATE INDEX "BookingDocument_documentType_status_createdAt_idx"
  ON "BookingDocument"("documentType", "status", "createdAt");

CREATE INDEX "BookingDocument_relatedToId_idx"
  ON "BookingDocument"("relatedToId");

-- Conservative backfill for existing generated invoice rows. These are legacy
-- numbers; new invoices use InvoiceSequence and the IKF-INV-YYYY-000001 format.
UPDATE "BookingDocument"
SET
  "docSubType" = COALESCE("docSubType", 'original'),
  "invoiceNumber" = COALESCE(
    "invoiceNumber",
    'IKF-INV-' || EXTRACT(YEAR FROM "createdAt")::int || '-LEGACY-' || UPPER(SUBSTRING("id", 1, 8))
  )
WHERE "documentType" = 'invoice';

UPDATE "BookingDocument"
SET "docSubType" = COALESCE("docSubType", 'original')
WHERE "documentType" <> 'invoice';

-- If historical duplicate active docs exist, keep the latest as "original" and
-- mark older rows as duplicate-N before creating the active unique index.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "bookingId", "bookingType", "documentType", COALESCE("docSubType", 'original')
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "BookingDocument"
  WHERE "status" NOT IN ('cancelled', 'void')
)
UPDATE "BookingDocument" bd
SET "docSubType" = 'duplicate-' || ranked.rn::text
FROM ranked
WHERE bd."id" = ranked."id" AND ranked.rn > 1;

ALTER TABLE "BookingDocument"
  ADD CONSTRAINT "BookingDocument_relatedToId_fkey"
  FOREIGN KEY ("relatedToId") REFERENCES "BookingDocument"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Active-document uniqueness. Void/cancelled documents do not block replacement.
CREATE UNIQUE INDEX "BookingDocument_active_document_unique"
  ON "BookingDocument"("bookingId", "bookingType", "documentType", COALESCE("docSubType", 'original'))
  WHERE "status" NOT IN ('cancelled', 'void');
