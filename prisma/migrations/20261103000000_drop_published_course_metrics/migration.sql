-- Retire only published course measurements. Keep course rows, geometry,
-- map-derived measurements, resort summaries, and every lift column intact.
BEGIN;

ALTER TABLE "map_courses"
  DROP COLUMN "distance",
  DROP COLUMN "angleAvg",
  DROP COLUMN "angleMax";
ALTER TABLE "courses"
  DROP COLUMN "distance",
  DROP COLUMN "angle";

CREATE FUNCTION pg_temp.omit_course_metrics(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'object'
    THEN value - 'distance' - 'avg' - 'max' ELSE value END
$$;

CREATE FUNCTION pg_temp.clean_course_feature(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(value -> 'properties') = 'object'
    THEN jsonb_set(value, '{properties}', pg_temp.omit_course_metrics(value -> 'properties'))
    ELSE value END
$$;

UPDATE "map_courses" SET
  "properties" = pg_temp.omit_course_metrics("properties"::jsonb),
  "derivedProperties" = pg_temp.omit_course_metrics("derivedProperties"::jsonb),
  "feature" = pg_temp.clean_course_feature("feature"::jsonb),
  "derivedFeature" = pg_temp.clean_course_feature("derivedFeature"::jsonb);

-- Unmatched legacy detail entries live in the virtual document's row order.
UPDATE "map_document_states" SET "metadata" = jsonb_set(
  "metadata"::jsonb, '{rowOrder}',
  COALESCE((SELECT jsonb_agg(CASE
    WHEN jsonb_typeof(item -> 'entry') = 'object'
    THEN jsonb_set(item, '{entry}', pg_temp.omit_course_metrics(item -> 'entry'))
    ELSE item END ORDER BY ordinal)
    FROM jsonb_array_elements("metadata"::jsonb -> 'rowOrder')
      WITH ORDINALITY AS entries(item, ordinal)), '[]'::jsonb)
)
WHERE "key" ~ '^resorts-temporary/slope_detail/[^/]+[.]json$'
  AND jsonb_typeof("metadata"::jsonb -> 'rowOrder') = 'array';

-- Pre-relational documents still used by older installations are cleaned too.
-- Immutable backups and submitted edit-request history remain historical evidence.
WITH cleaned AS (
  SELECT "key", CASE
    WHEN "key" ~ '/slope_detail/' AND jsonb_typeof(content::jsonb) = 'array'
    THEN COALESCE((SELECT jsonb_agg(pg_temp.omit_course_metrics(item) ORDER BY ordinal)
      FROM jsonb_array_elements(content::jsonb) WITH ORDINALITY AS items(item, ordinal)), '[]'::jsonb)
    WHEN jsonb_typeof(content::jsonb -> 'features') = 'array'
    THEN jsonb_set(content::jsonb, '{features}', COALESCE((
      SELECT jsonb_agg(pg_temp.clean_course_feature(item) ORDER BY ordinal)
      FROM jsonb_array_elements(content::jsonb -> 'features')
        WITH ORDINALITY AS items(item, ordinal)), '[]'::jsonb))
    ELSE content::jsonb END AS value
  FROM "data_documents"
  WHERE "key" ~ '^resorts-temporary/(slope_before(_osm)?|slope_10m(_osm)?|slope_detail)/[^/]+[.](geojson|json)$'
    AND content IS JSON
), changed AS (
  SELECT cleaned.* FROM cleaned JOIN "data_documents" USING ("key")
  WHERE content::jsonb IS DISTINCT FROM value
)
UPDATE "data_documents" AS document SET
  content = changed.value::text,
  hash = encode(sha256(convert_to(changed.value::text, 'UTF8')), 'hex'),
  version = document.version + 1,
  "updatedAt" = CURRENT_TIMESTAMP
FROM changed WHERE document."key" = changed."key";

-- Keep pre-canonical projection hashes consistent with their source documents.
UPDATE "map_document_states" AS state SET hash = document.hash
FROM "data_documents" AS document
WHERE state."key" = document."key" AND NOT state.relational
  AND state."key" ~ '^resorts-temporary/(slope_before(_osm)?|slope_10m(_osm)?|slope_detail)/';

COMMIT;
