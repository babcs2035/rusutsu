-- Slope profiles remain valid; remove only the obsolete curve classification.
ALTER TABLE "course_recommendation_features" DROP COLUMN "shape";
