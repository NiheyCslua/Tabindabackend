-- Product Categories: delete + subcategory field.
--
-- 1. Add a free-text, non-hierarchical "subcategory" column to Product —
--    just a second label, not a parent/child relationship to Category.
-- 2. Seed an "Uncategorized" ProductCategory row up front, since deleting a
--    category reassigns any products using it to "Uncategorized" (see
--    InventoryService.deleteProductCategory) and it should always exist as
--    a real, selectable category rather than being lazily created on first
--    use.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategory" TEXT NOT NULL DEFAULT '';

INSERT INTO "ProductCategory" ("id", "name", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000101', 'Uncategorized', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
