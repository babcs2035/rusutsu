/*
  Warnings:

  - You are about to drop the column `info` on the `yuki_magi` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `yuki_magi` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `yuki_magi` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "yuki_magi" DROP COLUMN "info",
DROP COLUMN "notes",
ADD COLUMN     "benefit" TEXT,
ADD COLUMN     "exclusionDate" TEXT,
ADD COLUMN     "period" TEXT,
ADD COLUMN     "tag" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "url" TEXT;
