-- AlterTable
ALTER TABLE "lift_ticket_seasons" ADD COLUMN     "liftPriceUrl" TEXT,
ADD COLUMN     "liftPurchaseUrl" TEXT,
ADD COLUMN     "rentalPriceUrl" TEXT,
ADD COLUMN     "rentalPurchaseUrl" TEXT;

-- The columns mirror data.main_links, which the write path copies on every save.
-- Backfill documents that already carry main_links (none are expected yet).
UPDATE "lift_ticket_seasons"
SET "liftPriceUrl" = "data"->'main_links'->>'lift_price_url',
    "liftPurchaseUrl" = "data"->'main_links'->>'lift_purchase_url',
    "rentalPriceUrl" = "data"->'main_links'->>'rental_price_url',
    "rentalPurchaseUrl" = "data"->'main_links'->>'rental_purchase_url'
WHERE "data"->'main_links' IS NOT NULL;
