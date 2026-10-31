-- CreateTable
CREATE TABLE "resort_display_groups" (
    "id" TEXT NOT NULL,
    "label" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resort_display_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resort_display_group_members" (
    "groupId" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "resort_display_group_members_pkey" PRIMARY KEY ("groupId","skiResortId")
);

-- CreateIndex
CREATE INDEX "resort_display_group_members_skiResortId_idx" ON "resort_display_group_members"("skiResortId");

-- AddForeignKey
ALTER TABLE "resort_display_group_members" ADD CONSTRAINT "resort_display_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "resort_display_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resort_display_group_members" ADD CONSTRAINT "resort_display_group_members_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

