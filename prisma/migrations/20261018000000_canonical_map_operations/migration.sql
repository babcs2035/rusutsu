-- Additive schema. Data cutover is performed by migrateCanonicalMaps.ts.
ALTER TABLE "map_courses"
  ALTER COLUMN "feature" DROP NOT NULL,
  ADD COLUMN "derivedGeometry" JSONB,
  ADD COLUMN "geometryType" TEXT,
  ADD COLUMN "featureMetadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "derivedMetadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "derivedProperties" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "derivedIndex" INTEGER,
  ADD COLUMN "horizontalDistance" DOUBLE PRECISION,
  ADD COLUMN "slopeDistance" DOUBLE PRECISION,
  ADD COLUMN "elevationDifference" DOUBLE PRECISION,
  ADD COLUMN "calculatedAverageSlope" DOUBLE PRECISION,
  ADD COLUMN "calculatedMaxSlope" DOUBLE PRECISION,
  ADD COLUMN "elevationReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crawledNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mappingAssigned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" TEXT,
  ADD COLUMN "latestNote" TEXT,
  ADD COLUMN "officialUpdatedAt" TEXT,
  ADD COLUMN "statusObservedAt" TIMESTAMPTZ(3),
  ADD COLUMN "statusSnapshotId" TEXT,
  ADD COLUMN "statusName" TEXT,
  ADD COLUMN "statusSourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hasStatusSource" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "map_courses" ADD CONSTRAINT "map_courses_status_check" CHECK ("status" IS NULL OR "status" IN ('○','△','×'));
ALTER TABLE "map_lifts"
  ALTER COLUMN "feature" DROP NOT NULL,
  ADD COLUMN "derivedGeometry" JSONB,
  ADD COLUMN "geometryType" TEXT,
  ADD COLUMN "featureMetadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "derivedMetadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "derivedProperties" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "derivedIndex" INTEGER,
  ADD COLUMN "horizontalDistance" DOUBLE PRECISION,
  ADD COLUMN "slopeDistance" DOUBLE PRECISION,
  ADD COLUMN "elevationDifference" DOUBLE PRECISION,
  ADD COLUMN "calculatedAverageSlope" DOUBLE PRECISION,
  ADD COLUMN "calculatedMaxSlope" DOUBLE PRECISION,
  ADD COLUMN "elevationReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crawledNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mappingAssigned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" TEXT,
  ADD COLUMN "latestNote" TEXT,
  ADD COLUMN "officialUpdatedAt" TEXT,
  ADD COLUMN "statusObservedAt" TIMESTAMPTZ(3),
  ADD COLUMN "statusSnapshotId" TEXT,
  ADD COLUMN "statusName" TEXT,
  ADD COLUMN "statusSourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hasStatusSource" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "map_lifts" ADD CONSTRAINT "map_lifts_status_check" CHECK ("status" IS NULL OR "status" IN ('○','△','×'));

ALTER TABLE "map_document_states"
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'application/geo+json',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "relational" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "ski_resort_operation_summaries" (
  "skiResortId" TEXT PRIMARY KEY,
  "hasMap" BOOLEAN NOT NULL,
  "courseTotal" INTEGER,
  "courseActive" INTEGER,
  "liftTotal" INTEGER,
  "liftActive" INTEGER,
  "courseCountSource" TEXT NOT NULL,
  "liftCountSource" TEXT NOT NULL,
  "calculationVersion" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "summary_resort_fk" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "count_source_check" CHECK ("courseCountSource" IN ('basic','map','mapping') AND "liftCountSource" IN ('basic','map','mapping')),
  CONSTRAINT "course_counts_check" CHECK (("courseTotal" IS NULL OR "courseTotal" > 0) AND ("courseActive" IS NULL OR ("courseTotal" IS NOT NULL AND "courseActive" BETWEEN 0 AND "courseTotal"))),
  CONSTRAINT "lift_counts_check" CHECK (("liftTotal" IS NULL OR "liftTotal" > 0) AND ("liftActive" IS NULL OR ("liftTotal" IS NOT NULL AND "liftActive" BETWEEN 0 AND "liftTotal")))
);

ALTER TABLE "map_courses"
  ADD COLUMN "piste" TEXT,
  ADD COLUMN "snowboard" TEXT,
  ADD COLUMN "morning" TEXT,
  ADD COLUMN "night" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "image" TEXT,
  ADD COLUMN "youtubeUrl" TEXT,
  ADD COLUMN "searchWord" TEXT,
  ADD COLUMN "maxWidth" DOUBLE PRECISION,
  ADD COLUMN "minWidth" DOUBLE PRECISION;

ALTER TABLE "map_lifts"
  ADD COLUMN "speed" TEXT,
  ADD COLUMN "hood" TEXT,
  ADD COLUMN "footrest" TEXT,
  ADD COLUMN "towers" TEXT,
  ADD COLUMN "signal" TEXT,
  ADD COLUMN "oilShield" TEXT,
  ADD COLUMN "maker" TEXT,
  ADD COLUMN "year" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "searchWord" TEXT,
  ADD COLUMN "link" TEXT,
  ADD COLUMN "image" TEXT,
  ADD COLUMN "youtubeUrl" TEXT,
  ADD COLUMN "morning" TEXT,
  ADD COLUMN "night" TEXT,
  ADD COLUMN "vertical" DOUBLE PRECISION,
  ADD COLUMN "top" DOUBLE PRECISION,
  ADD COLUMN "bottom" DOUBLE PRECISION;
