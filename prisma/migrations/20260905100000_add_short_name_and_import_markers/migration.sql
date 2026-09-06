ALTER TABLE "ski_resorts" ADD COLUMN "shortName" TEXT;

CREATE TABLE "canonical_data_migrations" (
    "key" VARCHAR(200) NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "details" JSONB NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canonical_data_migrations_pkey" PRIMARY KEY ("key")
);
