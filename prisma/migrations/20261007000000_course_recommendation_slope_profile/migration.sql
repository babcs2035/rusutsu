-- Version 3 features replace the 3-degree histogram and 50m steep metrics.
-- Rows are derived data; recommendations:rebuild repopulates them.
DELETE FROM "course_recommendation_features";
ALTER TABLE "course_recommendation_features"
  DROP CONSTRAINT "course_recommendation_features_histogram_check",
  DROP CONSTRAINT "course_recommendation_steep_slope_valid",
  DROP CONSTRAINT "course_recommendation_steep_distance_valid",
  DROP COLUMN "histogram",
  DROP COLUMN "cumulative",
  DROP COLUMN "meanSlope",
  DROP COLUMN "steepSlope",
  DROP COLUMN "steepDistance",
  ADD COLUMN "maxSlope" DOUBLE PRECISION NOT NULL,
  ADD COLUMN "slopeDistances" DOUBLE PRECISION[] NOT NULL,
  ADD CONSTRAINT "course_recommendation_max_slope_valid"
    CHECK ("maxSlope" BETWEEN 0 AND 90),
  ADD CONSTRAINT "course_recommendation_slope_distances_valid"
    CHECK (cardinality("slopeDistances") = 61);
