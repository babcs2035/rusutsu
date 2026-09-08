CREATE TABLE "ski_resort_former_name_ruby_segments" (
    "skiResortId" TEXT NOT NULL,
    "formerNamePosition" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "ruby" VARCHAR(300),
    CONSTRAINT "ski_resort_former_name_ruby_segments_pkey" PRIMARY KEY ("skiResortId", "formerNamePosition", "position"),
    CONSTRAINT "ski_resort_former_name_ruby_segments_former_name_fkey" FOREIGN KEY ("skiResortId", "formerNamePosition") REFERENCES "ski_resort_former_names"("skiResortId", "position") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 既存の読みは旧称全体に付く1つのルビとして引き継ぐ。
INSERT INTO "ski_resort_former_name_ruby_segments" ("skiResortId", "formerNamePosition", "position", "text", "ruby")
SELECT "skiResortId", "position", 0, "name", "reading"
FROM "ski_resort_former_names"
WHERE "reading" IS NOT NULL;
