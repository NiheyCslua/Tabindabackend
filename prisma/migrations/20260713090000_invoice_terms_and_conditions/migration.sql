-- Invoice Terms & Conditions – Editable Per Invoice
--
-- Each invoice stores its own independent copy of its Terms & Conditions.
-- Invoice Templates remain simple default-text providers (unchanged) — this
-- column is populated from the selected template at creation time and from
-- then on belongs solely to the invoice. Nullable so existing invoices are
-- unaffected; printing/preview fall back to the template's default text for
-- any invoice where this is null (backward compatibility only).

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT;
