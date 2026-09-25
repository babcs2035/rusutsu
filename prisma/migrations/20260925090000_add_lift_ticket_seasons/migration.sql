-- CreateTable
CREATE TABLE "lift_ticket_seasons" (
    "skiResortId" TEXT NOT NULL,
    "seasonId" VARCHAR(9) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "data" JSON NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lift_ticket_seasons_pkey" PRIMARY KEY ("skiResortId","seasonId")
);

-- CreateIndex
CREATE INDEX "lift_ticket_seasons_seasonId_idx" ON "lift_ticket_seasons"("seasonId");

-- AddForeignKey
ALTER TABLE "lift_ticket_seasons" ADD CONSTRAINT "lift_ticket_seasons_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lift ticket documents used to live in data_documents under lift-ticket/.
-- They were last season's data plus the collection skill's working material
-- (drafts, audits, captured sources) and are intentionally not carried over.
DELETE FROM "data_documents" WHERE "key" LIKE 'lift-ticket/%';
