-- Allow Duplicate SKUs (Replace Restriction with Warning)
--
-- The Product Variant system isn't complete yet, so multiple product
-- records are currently used to represent different colour/configuration
-- variants of the same item — all sharing one SKU (e.g. "Mouse / Black /
-- MX-100" and "Mouse / White / MX-100"). The hard uniqueness constraint on
-- Product.sku blocked exactly that. Duplicate SKUs are now allowed; the
-- application surfaces a non-blocking warning instead (see
-- InventoryService.checkDuplicateSku), never a hard rejection.
--
-- Existing data needs no migration here — every SKU that was previously
-- unique remains valid; this only removes a restriction, it doesn't change
-- any stored values.

DROP INDEX IF EXISTS "Product_sku_key";
