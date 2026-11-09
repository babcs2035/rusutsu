CREATE TABLE "ski_track_imports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "analysis" JSONB NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ski_track_imports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ski_track_imports_userId_fileHash_key" ON "ski_track_imports"("userId", "fileHash");
CREATE INDEX "ski_track_imports_userId_recordedAt_idx" ON "ski_track_imports"("userId", "recordedAt");
ALTER TABLE "ski_track_imports" ADD CONSTRAINT "ski_track_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
