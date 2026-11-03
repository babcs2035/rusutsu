import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCourse } from "@/features/slope/utils/courseOps";
import { courseToSavePayload } from "@/features/slope/utils/exportFiles";
import { cleanCourseDocumentContent } from "./retiredMetrics";

test("retiring course measurements preserves identity, geometry and calculated metrics", () => {
  const properties = {
    entityId: "course-a",
    name: "メロディ",
    distance: 350,
    avg: 8,
    max: 12,
    slope_dist_map: 360,
    avg_slope_deg_map: 9,
    max_slope_deg_map: 14,
    level: "初級",
    piste: "○",
    courseGrouping: { id: "group-a" },
  };
  const feature = {
    type: "Feature",
    properties,
    geometry: {
      type: "LineString",
      coordinates: [
        [140, 43, 100],
        [140.01, 43.01, 50],
      ],
    },
  };
  const original = JSON.stringify({
    type: "FeatureCollection",
    features: [feature],
  });
  for (const folder of [
    "slope_before",
    "slope_before_osm",
    "slope_10m",
    "slope_10m_osm",
  ]) {
    const cleaned = JSON.parse(
      cleanCourseDocumentContent(
        `resorts-temporary/${folder}/sample.geojson`,
        original,
      ),
    );
    const {
      distance: _distance,
      avg: _avg,
      max: _max,
      ...retained
    } = properties;
    assert.deepEqual(cleaned.features, [{ ...feature, properties: retained }]);
  }
  assert.equal(
    cleanCourseDocumentContent(
      "resorts-temporary/lift_before/sample.geojson",
      original,
    ),
    original,
  );
  const details = JSON.parse(
    cleanCourseDocumentContent(
      "resorts-temporary/slope_detail/sample.json",
      JSON.stringify([properties]),
    ),
  );
  assert.equal(details.length, 1);
  assert.equal(Object.hasOwn(details[0], "distance"), false);
  assert.equal(details[0].slope_dist_map, 360);
});

test("old draft properties cannot reintroduce retired course fields", () => {
  const course = createEmptyCourse();
  course.skiId = course.originalSkiId = "sample";
  course.name = "メロディ";
  course.coordinates = [
    [140, 43],
    [140.01, 43.01],
  ];
  const old = { distance: 350, avg: 8, max: 12 };
  Object.assign(course.detail, old);
  course.loadedDetail = { ...course.detail };
  course.rawDetail = { ...old, level: "初級" };
  course.beforeExtras = { ...old, slope_dist_map: 360 };
  course.detailExtras = { ...old, snowboard: "○" };
  const saved = courseToSavePayload(course);
  for (const properties of [saved.properties, saved.detail])
    for (const key of ["distance", "avg", "max"])
      assert.equal(Object.hasOwn(properties, key), false);
  assert.deepEqual(saved.coordinates, course.coordinates);
  assert.equal(saved.properties.entityId, course.id);
  assert.equal(saved.properties.slope_dist_map, 360);
});
