-- Rebuild the unpublished community draft as visit reports with child observations.
-- No existing public posts have been submitted; there is no legacy split-post import.
ALTER TABLE community_posts DROP CONSTRAINT community_post_kind,
  DROP CONSTRAINT community_post_rating,
  DROP CONSTRAINT community_post_position,
  DROP CONSTRAINT community_item_type,
  DROP CONSTRAINT "community_posts_parentId_fkey";
DROP INDEX "community_posts_authorId_batchKey_batchIndex_key";
DROP INDEX "community_posts_resortId_courseId_status_createdAt_idx";
ALTER TABLE community_posts RENAME COLUMN "batchKey" TO "submissionKey";
ALTER TABLE community_posts DROP COLUMN "batchIndex", DROP COLUMN "courseId",
  DROP COLUMN kind, DROP COLUMN "snowQualities", DROP COLUMN conditions,
  DROP COLUMN crowding, DROP COLUMN latitude, DROP COLUMN longitude,
  DROP COLUMN present, DROP COLUMN "itemType", DROP COLUMN size, DROP COLUMN "parentId";
ALTER TABLE community_posts ADD CONSTRAINT community_report_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
CREATE UNIQUE INDEX "community_posts_authorId_submissionKey_key" ON community_posts("authorId", "submissionKey");
CREATE TABLE community_entries (
  id TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "clientKey" VARCHAR(36) NOT NULL,
  position INTEGER NOT NULL,
  kind VARCHAR(16) NOT NULL,
  "courseId" TEXT,
  "liftId" TEXT,
  "targetName" VARCHAR(500) NOT NULL,
  body VARCHAR(4000) NOT NULL DEFAULT '',
  "snowQualities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  conditions TEXT[] DEFAULT ARRAY[]::TEXT[],
  crowding VARCHAR(16),
  rating INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  present BOOLEAN,
  "itemType" VARCHAR(30),
  size VARCHAR(100),
  "waitMinutes" INTEGER,
  CONSTRAINT community_entry_kind CHECK (kind IN ('COURSE','LIFT','MOGUL','ITEM')),
  CONSTRAINT community_entry_position CHECK (position BETWEEN 0 AND 39),
  CONSTRAINT community_entry_target CHECK (
    (kind = 'COURSE' AND "courseId" IS NOT NULL AND "liftId" IS NULL) OR
    (kind = 'LIFT' AND "liftId" IS NOT NULL AND "courseId" IS NULL) OR
    (kind IN ('MOGUL','ITEM') AND "liftId" IS NULL)
  ),
  CONSTRAINT community_entry_point CHECK (
    (kind IN ('COURSE','LIFT') AND latitude IS NULL AND longitude IS NULL AND present IS NULL) OR
    (kind IN ('MOGUL','ITEM') AND latitude IS NOT NULL AND longitude IS NOT NULL AND present IS NOT NULL
      AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT community_entry_rating CHECK (rating IS NULL OR (kind IN ('COURSE','LIFT') AND rating BETWEEN 1 AND 5)),
  CONSTRAINT community_entry_wait CHECK ("waitMinutes" IS NULL OR (kind = 'LIFT' AND "waitMinutes" BETWEEN 0 AND 240)),
  CONSTRAINT community_entry_item CHECK (
    (kind = 'ITEM' AND "itemType" IS NOT NULL AND "itemType" IN ('キッカー','レール','ボックス','ハーフパイプ','ウォール','ヒップ・スパイン','バンク','ウェーブ','その他')) OR
    (kind <> 'ITEM' AND "itemType" IS NULL AND size IS NULL)
  )
);
CREATE UNIQUE INDEX "community_entries_postId_clientKey_key" ON community_entries("postId","clientKey");
CREATE UNIQUE INDEX "community_entries_postId_position_key" ON community_entries("postId",position);
CREATE INDEX "community_entries_kind_courseId_postId_idx" ON community_entries(kind,"courseId","postId");
CREATE INDEX "community_entries_kind_liftId_postId_idx" ON community_entries(kind,"liftId","postId");
