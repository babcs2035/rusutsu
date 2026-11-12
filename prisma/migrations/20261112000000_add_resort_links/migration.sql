CREATE TABLE "resort_links" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "category" VARCHAR(50),
    "label" VARCHAR(200),
    "url" TEXT NOT NULL,
    "note" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "editorKind" VARCHAR(20) NOT NULL,
    "editorId" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resort_links_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resort_links_skiResortId_sortOrder_idx" ON "resort_links"("skiResortId", "sortOrder");
CREATE INDEX "resort_links_source_type_idx" ON "resort_links"("source", "type");
ALTER TABLE "resort_links" ADD CONSTRAINT "resort_links_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
