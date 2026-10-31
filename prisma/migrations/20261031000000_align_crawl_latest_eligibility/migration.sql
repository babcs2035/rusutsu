-- アプリの採用条件に合わせ、掲載なしと非blocking警告も許可する。
-- 失敗・検証不能なカテゴリの採用は引き続き禁止する。
ALTER TABLE "crawl_latest_category_snapshots"
DROP CONSTRAINT "crawl_latest_category_eligibility_check",
ADD CONSTRAINT "crawl_latest_category_eligibility_check" CHECK (
    NOT "eligibleForCurrent"
    OR (
        "state" IN ('SUCCESS', 'EMPTY', 'NOT_SUPPORTED')
        AND "validationState" IN ('VALID', 'WARNING')
    )
);
