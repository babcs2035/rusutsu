ALTER TABLE contribution_photos ADD COLUMN "entryId" TEXT;
ALTER TABLE contribution_photos ADD CONSTRAINT "contribution_photos_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES community_entries(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "contribution_photos_entryId_idx" ON contribution_photos("entryId");
ALTER TABLE contribution_photos ADD CONSTRAINT contribution_photo_entry_target
  CHECK ("entryId" IS NULL OR ("postId" IS NOT NULL AND "requestId" IS NULL));
