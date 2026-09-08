ALTER TABLE "ski_resorts" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "ski_resorts" ADD COLUMN "sourceResortIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "ski_resorts_mergedIntoId_idx" ON "ski_resorts"("mergedIntoId");
ALTER TABLE "ski_resorts" ADD CONSTRAINT "ski_resorts_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "ski_resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
