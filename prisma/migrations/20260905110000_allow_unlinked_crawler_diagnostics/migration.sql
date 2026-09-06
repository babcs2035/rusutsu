-- YukiMagi diagnostics concern an entire facility list, not one SkiResort.
-- Existing resort runs and foreign keys remain intact.
ALTER TABLE "crawl_latest_runs" ALTER COLUMN "skiResortId" DROP NOT NULL;
