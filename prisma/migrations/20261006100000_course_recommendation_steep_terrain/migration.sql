ALTER TABLE "course_recommendation_features"
  ADD COLUMN "steepSlope" DOUBLE PRECISION,
  ADD COLUMN "steepDistance" DOUBLE PRECISION,
  ADD CONSTRAINT "course_recommendation_steep_slope_valid"
    CHECK ("steepSlope" IS NULL OR "steepSlope" BETWEEN 0 AND 90),
  ADD CONSTRAINT "course_recommendation_steep_distance_valid"
    CHECK ("steepDistance" IS NULL OR
      ("steepDistance" >= 0 AND "steepDistance" <= "distance" + 0.000001));
