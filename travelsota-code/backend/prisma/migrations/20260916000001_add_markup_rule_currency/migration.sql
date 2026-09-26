-- MarkupRule.currency: currency a 'fixed' markupValue is denominated in.
-- Null on existing rows (legacy/unset) — see MarkupService.applyRules for
-- how this closes the "fixed markup added raw to any offer currency" gap.
ALTER TABLE "MarkupRule" ADD COLUMN "currency" TEXT;
