-- Replace the "retail" / "bulk" factory-default Invoice Templates with the
-- three new standard warranty templates, per explicit request: default
-- templates should be fully replaced, not added alongside the old ones.
--
-- NOTE (backward compatibility): any invoice created before this change
-- that still has `Invoice.template = 'retail'` or `'bulk'` is untouched by
-- this migration — that's just a historical record of which template was
-- selected at creation time. It only matters for invoices that predate the
-- per-invoice Terms & Conditions feature (i.e. `termsAndConditions IS
-- NULL`), since every other invoice already prints its own saved copy
-- regardless of what happens to templates. For that narrow legacy case,
-- the fallback lookup (getTemplateFromStore) will no longer find a
-- "retail"/"bulk" row and will fall back to whichever template is first in
-- the list instead — a cosmetic difference only, and only for invoices
-- that were already relying on a template's *current* text rather than
-- their own saved copy.

DELETE FROM "InvoiceTemplate" WHERE "id" IN ('retail', 'bulk');

INSERT INTO "InvoiceTemplate" ("id", "label", "description", "title", "policies", "closing", "createdAt", "updatedAt")
VALUES
(
    'standard_local',
    'Standard Local',
    'Standard local warranty terms',
    'Standard Local',
    '[
        "1- One Year Standard Manufacturer Warranty.",
        "2- Any damages due to abusing, breakage, electrical shocks, tampering into the warranty stickers or components shall void the warranty.",
        "3- All warranties are relevant to Manufacturers / Distributors under their prevailing warranty policy.",
        "4- Handling of warranty may take from next day to 90 days, depending on the availability of the affected hardware / component at the time of claiming the warranty.",
        "5- WARRANTY IS NON-TRANSFERABLE."
    ]'::jsonb,
    '',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'standard_international',
    'Standard International',
    'Standard international (HP) warranty terms',
    'Standard International',
    '[
        "1- HP Standard International Manufacturer Warranty.",
        "2- Any damages due to abusing, breakage, electrical shocks, tampering into the warranty stickers or components shall void the warranty.",
        "3- All warranties are relevant to Manufacturers / Distributors under their prevailing warranty policy.",
        "4- Handling of warranty may take from next day to 90 days, depending on the availability of the affected hardware / component at the time of claiming the warranty.",
        "5- WARRANTY IS NON-TRANSFERABLE."
    ]'::jsonb,
    '',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'standard_toners',
    'Standard Toners',
    'Standard toner warranty terms',
    'Standard Toners',
    '[
        "1- HP Standard Manufacturer warranty for 03 months or 40% usage whichever is earlier from invoice date for toner.",
        "2- Any damages due to abusing, breakage, electrical shocks, tampering into the warranty stickers or components shall void the warranty.",
        "3- All warranties are relevant to Manufacturers / Distributors under their prevailing warranty policy.",
        "4- Handling of warranty may take from next day to 90 days, depending on the availability of the affected hardware / component at the time of claiming the warranty.",
        "5- WARRANTY IS NON-TRANSFERABLE."
    ]'::jsonb,
    '',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
    "label"       = EXCLUDED."label",
    "description" = EXCLUDED."description",
    "title"       = EXCLUDED."title",
    "policies"    = EXCLUDED."policies",
    "closing"     = EXCLUDED."closing",
    "updatedAt"   = CURRENT_TIMESTAMP;
