-- お気に入りを利用者が並べ替えられるようにする。既存の行は追加した順に番号を振る。
ALTER TABLE "favorites" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "favorites" AS f
SET "position" = ordered."rank"
FROM (
  SELECT
    "userId",
    "skiResortId",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt", "skiResortId"
    ) - 1 AS "rank"
  FROM "favorites"
) AS ordered
WHERE f."userId" = ordered."userId"
  AND f."skiResortId" = ordered."skiResortId";
