-- CreateIndex
CREATE INDEX "crawl_latest_issues_severity_createdAt_idx" ON "crawl_latest_issues"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "crawl_latest_issues_createdAt_idx" ON "crawl_latest_issues"("createdAt");

-- CreateIndex
CREATE INDEX "crawl_latest_runs_outcome_observedAt_idx" ON "crawl_latest_runs"("outcome", "observedAt");
