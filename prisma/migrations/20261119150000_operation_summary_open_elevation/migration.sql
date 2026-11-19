-- 営業中（○・△）のコースだけの山頂・山麓。絞り込みの「営業中の標高差」に使う。
-- calculationVersion < 10 の行を次の読み取りで再集計して埋める。
ALTER TABLE "ski_resort_operation_summaries"
  ADD COLUMN "mapOpenTopElevation" INTEGER,
  ADD COLUMN "mapOpenBaseElevation" INTEGER;
