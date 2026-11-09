-- 比較URL用の短い番号。既存行はID順に振り、以降は連番で再利用しない。
CREATE SEQUENCE "ski_resorts_urlCode_seq" AS INTEGER;
ALTER TABLE "ski_resorts" ADD COLUMN "urlCode" INTEGER;

UPDATE "ski_resorts" AS resort
SET "urlCode" = numbered.row_number
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS row_number
  FROM "ski_resorts"
) AS numbered
WHERE resort."id" = numbered."id";

SELECT setval(
  '"ski_resorts_urlCode_seq"',
  COALESCE((SELECT MAX("urlCode") FROM "ski_resorts"), 0) + 1,
  false
);

ALTER TABLE "ski_resorts"
  ALTER COLUMN "urlCode" SET DEFAULT nextval('"ski_resorts_urlCode_seq"'),
  ALTER COLUMN "urlCode" SET NOT NULL;
ALTER SEQUENCE "ski_resorts_urlCode_seq" OWNED BY "ski_resorts"."urlCode";

-- 2桁の36進数（zz = 1295）に収まらない番号はURLにできないため作らせない。
ALTER TABLE "ski_resorts"
  ADD CONSTRAINT "ski_resorts_urlCode_range" CHECK ("urlCode" BETWEEN 1 AND 1295);

CREATE UNIQUE INDEX "ski_resorts_urlCode_key" ON "ski_resorts"("urlCode");
