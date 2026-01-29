-- CreateTable
CREATE TABLE "crawl_logs" (
    "id" TEXT NOT NULL,
    "crawlerName" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "message" TEXT,

    CONSTRAINT "crawl_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crawl_logs_crawlerName_key" ON "crawl_logs"("crawlerName");
