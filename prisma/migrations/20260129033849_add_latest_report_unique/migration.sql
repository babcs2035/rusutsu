/*
  Warnings:

  - A unique constraint covering the columns `[skiResortId]` on the table `latest_reports` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "latest_reports_skiResortId_key" ON "latest_reports"("skiResortId");
