/*
  Warnings:

  - You are about to drop the column `yukiMagiAvailable` on the `ski_resorts` table. All the data in the column will be lost.
  - You are about to drop the column `yukiMagiInfo` on the `ski_resorts` table. All the data in the column will be lost.
  - You are about to drop the column `yukiMagiNotes` on the `ski_resorts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ski_resorts" DROP COLUMN "yukiMagiAvailable",
DROP COLUMN "yukiMagiInfo",
DROP COLUMN "yukiMagiNotes";
