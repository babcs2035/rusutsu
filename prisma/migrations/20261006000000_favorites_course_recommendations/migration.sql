CREATE TABLE "favorites" (
  "userId" TEXT NOT NULL,
  "skiResortId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorites_pkey" PRIMARY KEY ("userId", "skiResortId"),
  CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorites_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "favorites_skiResortId_idx" ON "favorites"("skiResortId");
CREATE TABLE "course_recommendation_features" (
  "resortId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "courseIds" TEXT[] NOT NULL,
  "name" TEXT NOT NULL,
  "routeKey" TEXT,
  "histogram" DOUBLE PRECISION[] NOT NULL,
  "cumulative" DOUBLE PRECISION[] NOT NULL,
  "distance" DOUBLE PRECISION NOT NULL,
  "logDistance" DOUBLE PRECISION NOT NULL,
  "meanSlope" DOUBLE PRECISION NOT NULL,
  "shape" TEXT NOT NULL,
  "grooming" TEXT NOT NULL,
  "geometryHash" CHAR(64) NOT NULL,
  "sourceHash" CHAR(64) NOT NULL,
  "calculationVersion" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_recommendation_features_pkey" PRIMARY KEY ("resortId", "key"),
  CONSTRAINT "course_recommendation_features_distance_check" CHECK ("distance" > 0),
  CONSTRAINT "course_recommendation_features_shape_check" CHECK ("shape" IN ('normal', 'winding')),
  CONSTRAINT "course_recommendation_features_grooming_check" CHECK ("grooming" IN ('groomed', 'partial', 'ungroomed', 'unknown')),
  CONSTRAINT "course_recommendation_features_histogram_check" CHECK (cardinality("histogram") = 16 AND cardinality("cumulative") = 16)
);
CREATE INDEX "course_recommendation_features_resortId_calculationVersion_idx" ON "course_recommendation_features"("resortId", "calculationVersion");
