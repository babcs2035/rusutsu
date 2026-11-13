-- CreateTable
CREATE TABLE "compare_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compare_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compare_list_items" (
    "listId" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "compare_list_items_pkey" PRIMARY KEY ("listId","skiResortId")
);

-- CreateIndex
CREATE INDEX "compare_lists_userId_updatedAt_idx" ON "compare_lists"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "compare_list_items_skiResortId_idx" ON "compare_list_items"("skiResortId");

-- AddForeignKey
ALTER TABLE "compare_lists" ADD CONSTRAINT "compare_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compare_list_items" ADD CONSTRAINT "compare_list_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "compare_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compare_list_items" ADD CONSTRAINT "compare_list_items_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

