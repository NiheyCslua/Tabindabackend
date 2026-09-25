-- Invoice Templates: move from browser-local (Zustand `persist` in
-- localStorage) to a real database table, so template edits made in
-- Settings are visible from any device/session instead of just the one
-- that made them.
--
-- Seeded with the exact same two factory defaults ("retail", "bulk") that
-- previously lived only in frontend/lib/config/invoice-templates.ts, so
-- nothing changes for existing invoices or for anyone who never touched
-- Settings.

CREATE TABLE "InvoiceTemplate" (
    "id"          TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "title"       TEXT NOT NULL,
    "policies"    JSONB NOT NULL,
    "closing"     TEXT NOT NULL DEFAULT '',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InvoiceTemplate" ("id", "label", "description", "title", "policies", "closing", "createdAt", "updatedAt")
VALUES
(
    'retail',
    'Retail Customer',
    'Standard retail invoice with consumer policies',
    'Terms & Conditions — Retail',
    '[
        "All sales are final. Returns accepted within 7 days of purchase with original packaging and receipt.",
        "Defective items may be exchanged within 14 days subject to inspection.",
        "Warranty claims must be directed to the manufacturer unless otherwise stated.",
        "Prices include applicable taxes as shown. No further discounts apply.",
        "Payment is due in full at the time of purchase. Cash, card, and bank transfer accepted."
    ]'::jsonb,
    'Thank you for shopping with HB Computers. For support, contact us at support@hbcomputers.pk',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'bulk',
    'Bulk / Wholesale Customer',
    'Wholesale invoice with bulk purchase policies',
    'Terms & Conditions — Wholesale / Bulk',
    '[
        "Minimum order quantities apply as agreed in the purchase order.",
        "Payment terms: 50% advance, balance due within 15 days of delivery unless a credit account is in place.",
        "Returns or exchanges are not accepted for bulk orders unless goods are confirmed defective on delivery.",
        "Pricing is valid for the current order only and subject to change on future orders.",
        "Bulk discounts applied as per negotiated rate. All amounts shown are exclusive of further promotional offers.",
        "Delivery timelines are estimated and not guaranteed. HB Computers is not liable for delays caused by third-party logistics."
    ]'::jsonb,
    'For account queries or reorder arrangements, contact your dedicated account manager at wholesale@hbcomputers.pk',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;
