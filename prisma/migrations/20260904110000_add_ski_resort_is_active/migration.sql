-- Existing resorts stay published. Admins can hide a resort without deleting it.
ALTER TABLE "ski_resorts"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
