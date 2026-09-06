-- CreateEnum
CREATE TYPE "CrawlLatestSourceMode" AS ENUM ('LIVE', 'WAYBACK_VALIDATION', 'LEGACY_IMPORT');

-- CreateEnum
CREATE TYPE "CrawlLatestRunOutcome" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "CrawlLatestCategoryKind" AS ENUM ('COMMENT', 'WEATHER', 'COURSES', 'LIFTS');

-- CreateEnum
CREATE TYPE "CrawlLatestCategoryState" AS ENUM ('SUCCESS', 'EMPTY', 'NOT_SUPPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CrawlLatestValidationState" AS ENUM ('VALID', 'WARNING', 'INVALID');

-- CreateEnum
CREATE TYPE "CrawlLatestIssueSeverity" AS ENUM ('WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "CrawlLatestArtifactKind" AS ENUM ('RENDERED_DOM');

-- CreateEnum
CREATE TYPE "CrawlLatestArtifactState" AS ENUM ('AVAILABLE', 'FAILED');

-- CreateTable
CREATE TABLE "crawl_latest_runs" (
    "id" TEXT NOT NULL,
    "producerId" VARCHAR(100) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceMode" "CrawlLatestSourceMode" NOT NULL DEFAULT 'LIVE',
    "archiveTimestamp" VARCHAR(14),
    "schemaVersion" INTEGER NOT NULL,
    "crawlerFile" VARCHAR(500),
    "crawlerRevision" VARCHAR(128),
    "crawlerSourceHash" CHAR(64),
    "rawPayload" JSONB NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "outcome" "CrawlLatestRunOutcome" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_latest_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crawl_latest_runs_time_order_check" CHECK ("completedAt" >= "observedAt"),
    CONSTRAINT "crawl_latest_runs_archive_mode_check" CHECK (
        ("sourceMode" = 'WAYBACK_VALIDATION' AND "archiveTimestamp" IS NOT NULL)
        OR ("sourceMode" <> 'WAYBACK_VALIDATION' AND "archiveTimestamp" IS NULL)
    ),
    CONSTRAINT "crawl_latest_runs_archive_timestamp_check" CHECK (
        "archiveTimestamp" IS NULL OR "archiveTimestamp" ~ '^[0-9]{8,14}$'
    ),
    CONSTRAINT "crawl_latest_runs_schema_version_check" CHECK ("schemaVersion" > 0),
    CONSTRAINT "crawl_latest_runs_raw_payload_check" CHECK (jsonb_typeof("rawPayload") = 'object'),
    CONSTRAINT "crawl_latest_runs_request_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "crawl_latest_runs_crawler_source_hash_check" CHECK (
        "crawlerSourceHash" IS NULL OR "crawlerSourceHash" ~ '^[0-9a-f]{64}$'
    )
);

-- CreateTable
CREATE TABLE "crawl_latest_category_snapshots" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "kind" "CrawlLatestCategoryKind" NOT NULL,
    "state" "CrawlLatestCategoryState" NOT NULL,
    "validationState" "CrawlLatestValidationState" NOT NULL,
    "eligibleForCurrent" BOOLEAN NOT NULL,
    "data" JSONB,
    "sourceUrls" TEXT[],
    "itemCount" INTEGER NOT NULL,
    "usableItemCount" INTEGER NOT NULL,
    "contentHash" CHAR(64),
    "nameSetHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_latest_category_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crawl_latest_category_counts_check" CHECK (
        "itemCount" >= 0
        AND "usableItemCount" >= 0
        AND "usableItemCount" <= "itemCount"
    ),
    CONSTRAINT "crawl_latest_category_eligibility_check" CHECK (
        NOT "eligibleForCurrent"
        OR ("state" = 'SUCCESS' AND "validationState" = 'VALID')
    ),
    CONSTRAINT "crawl_latest_category_content_hash_check" CHECK (
        "contentHash" IS NULL OR "contentHash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "crawl_latest_category_name_set_hash_check" CHECK (
        "nameSetHash" IS NULL OR "nameSetHash" ~ '^[0-9a-f]{64}$'
    )
);

-- CreateTable
CREATE TABLE "crawl_latest_currents" (
    "skiResortId" TEXT NOT NULL,
    "kind" "CrawlLatestCategoryKind" NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "crawl_latest_currents_pkey" PRIMARY KEY ("skiResortId", "kind")
);

-- CreateTable
CREATE TABLE "crawl_latest_issues" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalId" VARCHAR(128),
    "categoryKind" "CrawlLatestCategoryKind",
    "severity" "CrawlLatestIssueSeverity" NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstOccurredAt" TIMESTAMPTZ(3),
    "lastOccurredAt" TIMESTAMPTZ(3),
    "blocksPromotion" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_latest_issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crawl_latest_issues_occurrences_check" CHECK ("occurrences" > 0),
    CONSTRAINT "crawl_latest_issues_time_order_check" CHECK (
        "firstOccurredAt" IS NULL
        OR "lastOccurredAt" IS NULL
        OR "lastOccurredAt" >= "firstOccurredAt"
    )
);

-- CreateTable
CREATE TABLE "crawl_latest_artifacts" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "categoryKind" "CrawlLatestCategoryKind",
    "kind" "CrawlLatestArtifactKind" NOT NULL,
    "state" "CrawlLatestArtifactState" NOT NULL,
    "pageKey" VARCHAR(255) NOT NULL,
    "title" TEXT,
    "requestedUrl" TEXT,
    "finalUrl" TEXT,
    "httpStatus" INTEGER,
    "storageKey" TEXT,
    "sha256" CHAR(64),
    "sizeBytes" BIGINT,
    "contentType" VARCHAR(255),
    "contentEncoding" VARCHAR(100),
    "captureError" TEXT,
    "redactionVersion" INTEGER NOT NULL,
    "issueExternalIds" TEXT[],
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_latest_artifacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crawl_latest_artifacts_size_check" CHECK (
        "sizeBytes" IS NULL OR "sizeBytes" >= 0
    ),
    CONSTRAINT "crawl_latest_artifacts_http_status_check" CHECK (
        "httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599
    ),
    CONSTRAINT "crawl_latest_artifacts_redaction_check" CHECK ("redactionVersion" > 0),
    CONSTRAINT "crawl_latest_artifacts_sha256_check" CHECK (
        "sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "crawl_latest_artifacts_state_check" CHECK (
        (
            "state" = 'AVAILABLE'
            AND "storageKey" IS NOT NULL
            AND "sha256" IS NOT NULL
            AND "sizeBytes" IS NOT NULL
            AND "captureError" IS NULL
        )
        OR ("state" = 'FAILED' AND "captureError" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_runs_producerId_idempotencyKey_key" ON "crawl_latest_runs"("producerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_runs_id_skiResortId_key" ON "crawl_latest_runs"("id", "skiResortId");

-- CreateIndex
CREATE INDEX "crawl_latest_runs_skiResortId_observedAt_idx" ON "crawl_latest_runs"("skiResortId", "observedAt");

-- CreateIndex
CREATE INDEX "crawl_latest_runs_sourceMode_observedAt_idx" ON "crawl_latest_runs"("sourceMode", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_category_snapshots_runId_kind_key" ON "crawl_latest_category_snapshots"("runId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_category_snapshots_id_skiResortId_kind_key" ON "crawl_latest_category_snapshots"("id", "skiResortId", "kind");

-- CreateIndex
CREATE INDEX "crawl_latest_category_snapshots_skiResortId_kind_eligibleFo_idx" ON "crawl_latest_category_snapshots"("skiResortId", "kind", "eligibleForCurrent", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_currents_snapshotId_key" ON "crawl_latest_currents"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_currents_snapshotId_skiResortId_kind_key" ON "crawl_latest_currents"("snapshotId", "skiResortId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_issues_runId_externalId_key" ON "crawl_latest_issues"("runId", "externalId");

-- CreateIndex
CREATE INDEX "crawl_latest_issues_runId_severity_idx" ON "crawl_latest_issues"("runId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_artifacts_runId_pageKey_key" ON "crawl_latest_artifacts"("runId", "pageKey");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_latest_artifacts_runId_storageKey_key" ON "crawl_latest_artifacts"("runId", "storageKey");

-- CreateIndex
CREATE INDEX "crawl_latest_artifacts_runId_kind_idx" ON "crawl_latest_artifacts"("runId", "kind");

-- AddForeignKey
ALTER TABLE "crawl_latest_runs" ADD CONSTRAINT "crawl_latest_runs_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_latest_category_snapshots" ADD CONSTRAINT "crawl_latest_category_snapshots_runId_skiResortId_fkey" FOREIGN KEY ("runId", "skiResortId") REFERENCES "crawl_latest_runs"("id", "skiResortId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_latest_currents" ADD CONSTRAINT "crawl_latest_currents_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_latest_currents" ADD CONSTRAINT "crawl_latest_currents_snapshotId_skiResortId_kind_fkey" FOREIGN KEY ("snapshotId", "skiResortId", "kind") REFERENCES "crawl_latest_category_snapshots"("id", "skiResortId", "kind") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_latest_issues" ADD CONSTRAINT "crawl_latest_issues_runId_fkey" FOREIGN KEY ("runId") REFERENCES "crawl_latest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_latest_artifacts" ADD CONSTRAINT "crawl_latest_artifacts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "crawl_latest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
