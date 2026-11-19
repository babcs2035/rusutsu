-- 地図の座標の標高から、線ごとの最低・最高標高とスキー場の山頂・山麓を持たせる。
ALTER TABLE "map_courses"
  ADD COLUMN "minElevation" DOUBLE PRECISION,
  ADD COLUMN "maxElevation" DOUBLE PRECISION;

ALTER TABLE "map_lifts"
  ADD COLUMN "minElevation" DOUBLE PRECISION,
  ADD COLUMN "maxElevation" DOUBLE PRECISION;

-- 集計の山頂・山麓は calculationVersion < 9 の行を次の読み取りで再集計して埋める。
ALTER TABLE "ski_resort_operation_summaries"
  ADD COLUMN "mapTopElevation" INTEGER,
  ADD COLUMN "mapBaseElevation" INTEGER;

-- 既存の線は保存時と同じく、標高付きの線（derivedGeometry）があればそれを、
-- 無ければ元の線の座標の3番目の値から埋める。
UPDATE "map_courses" AS c
SET "minElevation" = e.min_z, "maxElevation" = e.max_z
FROM (
  SELECT row.id, MIN((point ->> 2)::double precision) AS min_z,
         MAX((point ->> 2)::double precision) AS max_z
  FROM "map_courses" AS row,
       jsonb_array_elements(
         COALESCE(NULLIF(row."derivedGeometry", 'null'::jsonb), row."geometry") -> 'coordinates'
       ) AS point
  WHERE COALESCE(NULLIF(row."derivedGeometry", 'null'::jsonb), row."geometry") ->> 'type' = 'LineString'
    AND jsonb_typeof(point -> 2) = 'number'
  GROUP BY row.id
) AS e
WHERE c.id = e.id;

UPDATE "map_lifts" AS l
SET "minElevation" = e.min_z, "maxElevation" = e.max_z
FROM (
  SELECT row.id, MIN((point ->> 2)::double precision) AS min_z,
         MAX((point ->> 2)::double precision) AS max_z
  FROM "map_lifts" AS row,
       jsonb_array_elements(
         COALESCE(NULLIF(row."derivedGeometry", 'null'::jsonb), row."geometry") -> 'coordinates'
       ) AS point
  WHERE COALESCE(NULLIF(row."derivedGeometry", 'null'::jsonb), row."geometry") ->> 'type' = 'LineString'
    AND jsonb_typeof(point -> 2) = 'number'
  GROUP BY row.id
) AS e
WHERE l.id = e.id;
