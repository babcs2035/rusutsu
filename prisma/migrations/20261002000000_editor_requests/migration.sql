ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('viewer', 'editor', 'admin'));
CREATE TABLE "edit_requests" (
  "id" TEXT PRIMARY KEY, "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "resortId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "version" INTEGER NOT NULL DEFAULT 1,
  "submittedPayload" JSON NOT NULL, "submittedPlan" JSON NOT NULL,
  "candidatePayload" JSON NOT NULL, "candidatePlan" JSON NOT NULL,
  "reviewedById" TEXT, "reviewComment" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "edit_requests_status_check" CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'CONFLICT')),
  CONSTRAINT "edit_requests_kind_check" CHECK (kind IN ('resort', 'links', 'lift', 'slope', 'slope-order', 'ticket', 'review', 'review-import', 'mapping')),
  CONSTRAINT "edit_requests_version_check" CHECK (version > 0)
);
CREATE INDEX "edit_requests_authorId_createdAt_idx" ON "edit_requests"("authorId", "createdAt");
CREATE INDEX "edit_requests_status_createdAt_idx" ON "edit_requests"("status", "createdAt");
CREATE TABLE "edit_request_events" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "edit_requests"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "payload" JSON,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "edit_request_events_requestId_createdAt_idx" ON "edit_request_events"("requestId", "createdAt");
CREATE TABLE "edit_request_jobs" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "edit_requests"("id") ON DELETE RESTRICT,
  "payload" JSON NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "edit_request_jobs_status_check" CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SUPERSEDED'))
);
CREATE INDEX "edit_request_jobs_status_updatedAt_idx" ON "edit_request_jobs"("status", "updatedAt");
