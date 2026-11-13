-- 投稿へのコメントを廃止し、いいねをリアクション（ログインなしでも可）へ置き換える。
-- 既存のいいねはリアクションへ移す。コメントとその通知・AIチェック・通報は削除する。

-- CreateTable
CREATE TABLE "community_reactions" (
    "postId" TEXT NOT NULL,
    "actorKey" VARCHAR(80) NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reactions_pkey" PRIMARY KEY ("postId","actorKey","kind")
);

-- CreateIndex
CREATE INDEX "community_reactions_postId_kind_idx" ON "community_reactions"("postId", "kind");

-- CreateIndex
CREATE INDEX "community_reactions_userId_idx" ON "community_reactions"("userId");

-- AddForeignKey
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE community_reactions ADD CONSTRAINT community_reaction_kind
  CHECK (kind IN ('LIKE','HELPFUL','STILL_THERE','GONE'));
ALTER TABLE community_reactions ADD CONSTRAINT community_reaction_actor
  CHECK (
    ("userId" IS NOT NULL AND "actorKey" = 'u:' || "userId")
    OR ("userId" IS NULL AND "actorKey" ~ '^a:[a-f0-9]{64}$')
  );

-- いいねを移す
INSERT INTO community_reactions ("postId", "actorKey", "userId", kind, "createdAt")
SELECT "postId", 'u:' || "userId", "userId", 'LIKE', "createdAt" FROM community_likes;

UPDATE community_notifications
SET "dedupeKey" = 'reaction:' || "postId" || ':LIKE:u:' || split_part("dedupeKey", ':', 3)
WHERE kind = 'LIKE' AND "dedupeKey" LIKE 'like:%';

-- コメントに付いていたものを消す
DELETE FROM community_notifications WHERE kind = 'COMMENT';
DELETE FROM community_moderation_jobs WHERE "targetKind" = 'COMMENT';
DELETE FROM community_reports WHERE "targetKind" = 'COMMENT';

-- DropTable
DROP TABLE "community_likes";

-- DropTable
DROP TABLE "community_comments";
