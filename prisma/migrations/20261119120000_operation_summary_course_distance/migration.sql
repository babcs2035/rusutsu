-- コースの滑走距離を一覧の並び替え用に集計へ持たせる。
-- 既存行は calculationVersion < 8 なので、次の読み取りで再集計されて値が入る。
ALTER TABLE "ski_resort_operation_summaries"
  ADD COLUMN "courseDistanceTotal" INTEGER,
  ADD COLUMN "courseDistanceOpen" INTEGER,
  ADD COLUMN "courseDistanceFallbackLines" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "courseDistanceMissingLines" INTEGER NOT NULL DEFAULT 0;
