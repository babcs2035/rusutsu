-- Additive only. No existing data or tables are changed.
CREATE TABLE "map_course_groups" (
 "id" TEXT PRIMARY KEY, "resortId" TEXT NOT NULL, "sourceKind" TEXT NOT NULL,
 "name" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK ("kind" IN ('continuous','routes')),
 UNIQUE ("id", "resortId", "sourceKind")
);
CREATE TABLE "map_courses" (
 "id" TEXT PRIMARY KEY, "resortId" TEXT NOT NULL, "sourceKind" TEXT NOT NULL,
 "documentKey" TEXT NOT NULL, "sourceIndex" INTEGER NOT NULL,
 "name" TEXT, "groupId" TEXT, "sectionOrder" INTEGER CHECK ("sectionOrder" > 0),
 "difficulty" TEXT, "distance" DOUBLE PRECISION, "angleAvg" DOUBLE PRECISION, "angleMax" DOUBLE PRECISION,
 "properties" JSONB NOT NULL, "geometry" JSONB, "feature" JSONB NOT NULL, "derivedFeature" JSONB,
 "archivedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("groupId","resortId","sourceKind") REFERENCES "map_course_groups" ("id","resortId","sourceKind") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "map_courses_resortId_sourceKind_archivedAt_idx" ON "map_courses" ("resortId","sourceKind","archivedAt");
CREATE INDEX "map_courses_documentKey_sourceIndex_idx" ON "map_courses" ("documentKey","sourceIndex");
CREATE INDEX "map_courses_groupId_sectionOrder_idx" ON "map_courses" ("groupId","sectionOrder");
CREATE TABLE "map_lifts" (
 "id" TEXT PRIMARY KEY, "resortId" TEXT NOT NULL, "documentKey" TEXT NOT NULL, "sourceIndex" INTEGER NOT NULL,
 "name" TEXT, "type" TEXT, "capacity" INTEGER, "distance" DOUBLE PRECISION,
 "properties" JSONB NOT NULL, "geometry" JSONB, "feature" JSONB NOT NULL, "derivedFeature" JSONB,
 "archivedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "map_lifts_resortId_archivedAt_idx" ON "map_lifts" ("resortId","archivedAt");
CREATE INDEX "map_lifts_documentKey_sourceIndex_idx" ON "map_lifts" ("documentKey","sourceIndex");
CREATE TABLE "map_document_states" (
 "key" TEXT PRIMARY KEY, "hash" CHAR(64) NOT NULL, "featureCount" INTEGER NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "map_document_backups" (
 "key" TEXT NOT NULL, "hash" CHAR(64) NOT NULL, "content" TEXT NOT NULL, "mediaType" TEXT NOT NULL,
 "version" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("key","hash")
);
