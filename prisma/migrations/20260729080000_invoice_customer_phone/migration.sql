-- Add "Customer Number" (customer's phone/contact number) to Invoice.
--
-- Optional, per-invoice. Needed as a real column (not just derived from
-- the Customer relation, unlike how customerEmail currently falls back to
-- invoice.customer?.email) because a manually-entered customer during
-- Invoice Creation has no Customer record to derive it from at all.
--
-- Left blank, nothing prints under the customer's name — no placeholder,
-- no blank line.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
