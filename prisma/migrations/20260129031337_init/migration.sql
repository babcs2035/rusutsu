-- CreateTable
CREATE TABLE "ski_resorts" (
    "id" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prefecture" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "topElevation" INTEGER NOT NULL,
    "baseElevation" INTEGER NOT NULL,
    "verticalDrop" INTEGER NOT NULL,
    "numberOfCourses" INTEGER NOT NULL,
    "longestCourse" INTEGER NOT NULL,
    "steepestSlope" INTEGER,
    "beginnersCoursesPercent" INTEGER NOT NULL,
    "intermediateCoursesPercent" INTEGER NOT NULL,
    "advancedCoursesPercent" INTEGER NOT NULL,
    "courseImages" TEXT[],
    "typeNotPressed" INTEGER,
    "typePressed" INTEGER,
    "typeBump" INTEGER,
    "angleMax" INTEGER,
    "angleAvg" INTEGER,
    "numberOfLifts" INTEGER NOT NULL,
    "ropeways" INTEGER NOT NULL,
    "gondolas" INTEGER NOT NULL,
    "quadLifts" INTEGER NOT NULL,
    "tripleLifts" INTEGER NOT NULL,
    "pairLifts" INTEGER NOT NULL,
    "singleLifts" INTEGER NOT NULL,
    "otherLifts" INTEGER NOT NULL,
    "liftCapacity" INTEGER,
    "weekdayOpen" TEXT,
    "weekdayClose" TEXT,
    "weekendOpen" TEXT,
    "weekendClose" TEXT,
    "timesComment" TEXT,
    "website" TEXT,
    "skiersPercent" INTEGER,
    "snowboardersPercent" INTEGER,
    "sources" TEXT[],
    "descriptionShort" TEXT,
    "descriptionLong" TEXT,
    "outlineImages" TEXT[],
    "condition" TEXT,
    "status" TEXT,
    "review" DOUBLE PRECISION,
    "yukiMagiAvailable" BOOLEAN NOT NULL DEFAULT false,
    "yukiMagiInfo" TEXT,
    "yukiMagiNotes" TEXT,

    CONSTRAINT "ski_resorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "snowboard" TEXT,
    "difficulty" TEXT,
    "distance" INTEGER,
    "angle" INTEGER,
    "note" TEXT,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifts" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "distance" INTEGER,
    "hood" TEXT,

    CONSTRAINT "lifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAdult" INTEGER,
    "priceChild" INTEGER,
    "priceOlderChild" INTEGER,
    "priceSenior" INTEGER,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weathers" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "topData" JSONB,
    "midData" JSONB,
    "botData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weathers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecasts" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "dateStart" TEXT,
    "dateEnd" TEXT,
    "topData" JSONB,
    "middleData" JSONB,
    "bottomData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snow_depth_records" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "snow_depth_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snow_fall_records" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "snowfall" INTEGER NOT NULL,

    CONSTRAINT "snow_fall_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "latest_reports" (
    "id" TEXT NOT NULL,
    "skiResortId" TEXT NOT NULL,
    "datetime" TIMESTAMP(3) NOT NULL,
    "snowfall" INTEGER,
    "tempBase" DOUBLE PRECISION,
    "tempTop" DOUBLE PRECISION,
    "overview" TEXT,
    "precipitation" TEXT,
    "wind" TEXT,
    "visibility" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "latest_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amedas_data" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amedas_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yuki_magi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "info" TEXT,
    "notes" TEXT,

    CONSTRAINT "yuki_magi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weathers_skiResortId_date_key" ON "weathers"("skiResortId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "forecasts_skiResortId_key" ON "forecasts"("skiResortId");

-- CreateIndex
CREATE UNIQUE INDEX "snow_depth_records_skiResortId_date_key" ON "snow_depth_records"("skiResortId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "snow_fall_records_skiResortId_date_key" ON "snow_fall_records"("skiResortId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "yuki_magi_name_key" ON "yuki_magi"("name");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifts" ADD CONSTRAINT "lifts_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weathers" ADD CONSTRAINT "weathers_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snow_depth_records" ADD CONSTRAINT "snow_depth_records_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snow_fall_records" ADD CONSTRAINT "snow_fall_records_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latest_reports" ADD CONSTRAINT "latest_reports_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
