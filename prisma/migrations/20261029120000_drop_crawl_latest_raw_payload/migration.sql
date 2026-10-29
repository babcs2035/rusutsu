-- 取得結果は種類ごとの snapshot に保存しているので、送信内容の全体コピーは持たない。
ALTER TABLE "crawl_latest_runs" DROP CONSTRAINT "crawl_latest_runs_raw_payload_check";
ALTER TABLE "crawl_latest_runs" DROP COLUMN "rawPayload";
