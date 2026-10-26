-- One report carries exactly one item (course, lift, mogul or park). No posts
-- exist yet, so the multi-item report fields are dropped instead of migrated.
-- observedTime is NOT NULL: this fails safely if any report was already saved.

-- Report: date and time are required; the overall comment and rating are gone.
ALTER TABLE community_posts DROP CONSTRAINT community_report_rating;
ALTER TABLE community_posts DROP COLUMN body, DROP COLUMN rating;
ALTER TABLE community_posts ADD COLUMN "observedTime" VARCHAR(5) NOT NULL;
ALTER TABLE community_posts ADD CONSTRAINT community_post_observed_time
  CHECK ("observedTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Item: drop per-item ratings, course conditions and presence flags.
ALTER TABLE community_entries DROP CONSTRAINT community_entry_rating;
ALTER TABLE community_entries DROP CONSTRAINT community_entry_point;
ALTER TABLE community_entries DROP CONSTRAINT community_entry_position;
ALTER TABLE community_entries DROP COLUMN rating, DROP COLUMN conditions, DROP COLUMN present;
ALTER TABLE community_entries ADD COLUMN "status" VARCHAR(16);
ALTER TABLE community_entries ADD COLUMN "liftSpeed" DOUBLE PRECISION;
ALTER TABLE community_entries ADD COLUMN "liftSpeedLevel" VARCHAR(16);
ALTER TABLE community_entries ADD COLUMN "depth" VARCHAR(16);
-- position stays 0 so the existing (postId, position) unique key allows one item per report.
ALTER TABLE community_entries ADD CONSTRAINT community_entry_position CHECK (position = 0);
-- Courses and lifts may keep the photo location; moguls and parks require it.
ALTER TABLE community_entries ADD CONSTRAINT community_entry_point CHECK (
  ((latitude IS NULL) = (longitude IS NULL))
  AND (latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
  AND (kind IN ('COURSE','LIFT') OR latitude IS NOT NULL)
);
-- A NULL status must fail for courses and lifts, so test it explicitly:
-- "status IN (...)" alone is NULL there and would pass the CHECK.
ALTER TABLE community_entries ADD CONSTRAINT community_entry_status CHECK (
  CASE kind
    WHEN 'COURSE' THEN status IS NOT NULL AND status IN ('オープン','積雪不足','クローズ')
    WHEN 'LIFT' THEN status IS NOT NULL AND status IN ('オープン','減速中','クローズ')
    ELSE status IS NULL
  END
);
ALTER TABLE community_entries ADD CONSTRAINT community_entry_snow
  CHECK (kind <> 'LIFT' OR cardinality("snowQualities") = 0);
ALTER TABLE community_entries ADD CONSTRAINT community_entry_crowding
  CHECK (crowding IS NULL OR kind = 'COURSE');
ALTER TABLE community_entries ADD CONSTRAINT community_entry_lift_speed
  CHECK ("liftSpeed" IS NULL OR (kind = 'LIFT' AND "liftSpeed" BETWEEN 0.1 AND 12));
ALTER TABLE community_entries ADD CONSTRAINT community_entry_lift_speed_level
  CHECK ("liftSpeedLevel" IS NULL OR (kind = 'LIFT' AND "liftSpeedLevel" IN ('速い','普通','遅い')));
ALTER TABLE community_entries ADD CONSTRAINT community_entry_depth
  CHECK (depth IS NULL OR (kind = 'MOGUL' AND depth IN ('浅い','普通','深い')));

-- Report photos always belong to the item and are removed with it.
ALTER TABLE contribution_photos DROP CONSTRAINT "contribution_photos_entryId_fkey";
ALTER TABLE contribution_photos ADD CONSTRAINT "contribution_photos_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES community_entries(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE contribution_photos ADD CONSTRAINT contribution_photo_post_entry
  CHECK ("postId" IS NULL OR "entryId" IS NOT NULL);
