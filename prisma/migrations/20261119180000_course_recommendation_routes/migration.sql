-- Secondary routes are stored as search sources. Candidates stay main routes only.
ALTER TABLE "course_recommendation_features" ADD COLUMN "isMainRoute" BOOLEAN NOT NULL DEFAULT true;
