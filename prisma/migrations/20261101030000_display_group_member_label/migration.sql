-- 同時表示の組の中で、スキー場ごとに出す名前（例: 志賀高原どうしなら「焼額山」）
ALTER TABLE "resort_display_group_members" ADD COLUMN "label" VARCHAR(100);
