/*
  Warnings:

  - A unique constraint covering the columns `[yukiMagiId]` on the table `ski_resorts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ski_resorts" ADD COLUMN     "yukiMagiId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ski_resorts_yukiMagiId_key" ON "ski_resorts"("yukiMagiId");

-- AddForeignKey
ALTER TABLE "ski_resorts" ADD CONSTRAINT "ski_resorts_yukiMagiId_fkey" FOREIGN KEY ("yukiMagiId") REFERENCES "yuki_magi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
