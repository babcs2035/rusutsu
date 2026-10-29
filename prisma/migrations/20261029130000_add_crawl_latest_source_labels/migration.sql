-- 出典URLと同じ並びのラベル（例: コース、パーク）。離れた欄を分けて示すときだけ入る。
ALTER TABLE "crawl_latest_category_snapshots"
ADD COLUMN "sourceLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
