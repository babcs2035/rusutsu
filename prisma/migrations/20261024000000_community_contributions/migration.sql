-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nameMode" VARCHAR(16),
ADD COLUMN     "publicName" VARCHAR(40),
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "courseId" TEXT,
    "kind" VARCHAR(16) NOT NULL,
    "observedOn" VARCHAR(10) NOT NULL,
    "body" VARCHAR(4000) NOT NULL DEFAULT '',
    "snowQualities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "crowding" VARCHAR(16),
    "rating" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "present" BOOLEAN,
    "itemType" VARCHAR(30),
    "size" VARCHAR(100),
    "parentId" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "batchKey" VARCHAR(64) NOT NULL,
    "batchIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "operationKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_likes" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_likes_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "community_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "readAt" TIMESTAMP(3),
    "dedupeKey" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_photos" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "requestId" TEXT,
    "ownerId" TEXT,
    "bytes" BYTEA NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reports" (
    "id" TEXT NOT NULL,
    "targetKind" VARCHAR(16) NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_moderation_jobs" (
    "id" TEXT NOT NULL,
    "targetKind" VARCHAR(16) NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "result" JSONB,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_moderation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_rate_buckets" (
    "key" VARCHAR(100) NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_rate_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "community_posts_resortId_status_observedOn_idx" ON "community_posts"("resortId", "status", "observedOn");

-- CreateIndex
CREATE INDEX "community_posts_resortId_courseId_status_createdAt_idx" ON "community_posts"("resortId", "courseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "community_posts_authorId_createdAt_idx" ON "community_posts"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_posts_authorId_batchKey_batchIndex_key" ON "community_posts"("authorId", "batchKey", "batchIndex");

-- CreateIndex
CREATE INDEX "community_comments_postId_status_createdAt_idx" ON "community_comments"("postId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_comments_authorId_operationKey_key" ON "community_comments"("authorId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "community_notifications_dedupeKey_key" ON "community_notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "community_notifications_userId_readAt_createdAt_idx" ON "community_notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "contribution_photos_postId_idx" ON "contribution_photos"("postId");

-- CreateIndex
CREATE INDEX "contribution_photos_requestId_idx" ON "contribution_photos"("requestId");

-- CreateIndex
CREATE INDEX "community_reports_status_createdAt_idx" ON "community_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "community_moderation_jobs_status_nextAttemptAt_idx" ON "community_moderation_jobs"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_moderation_jobs_targetKind_targetId_targetVersion_key" ON "community_moderation_jobs"("targetKind", "targetId", "targetVersion");

-- CreateIndex
CREATE INDEX "contribution_rate_buckets_expiresAt_idx" ON "contribution_rate_buckets"("expiresAt");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "community_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_notifications" ADD CONSTRAINT "community_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_notifications" ADD CONSTRAINT "community_notifications_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_photos" ADD CONSTRAINT "contribution_photos_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_photos" ADD CONSTRAINT "contribution_photos_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "edit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_photos" ADD CONSTRAINT "contribution_photos_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Boundaries are enforced by the database as well as the public actions.
ALTER TABLE users ADD CONSTRAINT community_public_name_mode CHECK (
  ("nameMode" IS NULL AND "publicName" IS NULL) OR
  ("nameMode" IN ('GOOGLE','NICKNAME','ANONYMOUS') AND length("publicName") BETWEEN 1 AND 40)
);
ALTER TABLE community_posts ADD CONSTRAINT community_post_kind CHECK (kind IN ('REPORT','MOGUL','ITEM'));
ALTER TABLE community_posts ADD CONSTRAINT community_post_visibility CHECK (status IN ('VISIBLE','HIDDEN'));
ALTER TABLE community_posts ADD CONSTRAINT community_post_rating CHECK (rating IS NULL OR (kind = 'REPORT' AND rating BETWEEN 1 AND 5));
ALTER TABLE community_posts ADD CONSTRAINT community_post_position CHECK (
  (kind = 'REPORT' AND latitude IS NULL AND longitude IS NULL AND present IS NULL AND "parentId" IS NULL) OR
  (kind IN ('MOGUL','ITEM') AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND latitude IS NOT NULL AND longitude IS NOT NULL AND present IS NOT NULL)
);
ALTER TABLE community_posts ADD CONSTRAINT community_item_type CHECK (kind <> 'ITEM' OR "itemType" IN ('キッカー','レール','ボックス','ハーフパイプ','ウォール','ヒップ・スパイン','バンク','ウェーブ','その他'));
ALTER TABLE community_posts ADD CONSTRAINT community_observed_date CHECK ("observedOn" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE community_comments ADD CONSTRAINT community_comment_visibility CHECK (status IN ('VISIBLE','HIDDEN'));
ALTER TABLE contribution_photos ADD CONSTRAINT contribution_photo_target CHECK (
  ("requestId" IS NOT NULL AND "postId" IS NULL AND "ownerId" IS NULL) OR
  ("postId" IS NOT NULL AND "requestId" IS NULL AND "ownerId" IS NOT NULL)
);
ALTER TABLE contribution_photos ADD CONSTRAINT contribution_photo_format CHECK ("mimeType" = 'image/webp' AND width BETWEEN 1 AND 2048 AND height BETWEEN 1 AND 2048 AND octet_length(bytes) BETWEEN 1 AND 8388608);
ALTER TABLE edit_requests DROP CONSTRAINT edit_requests_kind_check;
ALTER TABLE edit_requests ADD CONSTRAINT edit_requests_kind_check CHECK (kind IN ('resort','links','lift','slope','slope-order','ticket','review','review-import','mapping','public-correction'));
ALTER TABLE edit_requests ADD COLUMN "submissionKey" VARCHAR(64);
CREATE UNIQUE INDEX "edit_requests_submissionKey_key" ON edit_requests("submissionKey");
