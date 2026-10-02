ALTER TABLE "ski_resorts" ADD COLUMN "linkKind" TEXT NOT NULL DEFAULT 'MERGED';
ALTER TABLE "ski_resorts" ADD CONSTRAINT "ski_resorts_linkKind_check" CHECK ("linkKind" IN ('MERGED', 'LINKED'));
ALTER TABLE "ski_resorts" ADD COLUMN "ticketGroupId" TEXT;
CREATE INDEX "ski_resorts_ticketGroupId_idx" ON "ski_resorts"("ticketGroupId");
