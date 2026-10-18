import { createHash } from "node:crypto";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  extractCourseFeatures,
  RECOMMENDATION,
  resample,
} from "@/features/course-recommendations/algorithm";
import {
  buildResortMapData,
  TEMPORARY_RESORTS_ROOT,
} from "@/lib/finalizedResortGeojson";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import { readMapOrDataDocument } from "@/server/course-lift/canonicalDocuments";

export const recommendationResortId = (key: string) =>
  /^resorts-temporary\/(?:slope_before(?:_osm)?|slope_10m(?:_osm)?|slope_detail)\/([^/]+)\.(?:geojson|json)$/u.exec(
    key,
  )?.[1] ?? null;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function geometryFingerprint(
  courses: FinalizedCourseFeature[],
  courseIds: string[],
) {
  const lines = courses
    .filter(c => courseIds.includes(c.id))
    .map(c => {
      const points = c.coordinates;
      const reversed = [...points].reverse();
      const canonical =
        JSON.stringify(points.map(p => p.slice(0, 2))) <
        JSON.stringify(reversed.map(p => p.slice(0, 2)))
          ? points
          : reversed;
      // Elevation and coordinate density are irrelevant for detecting a copied map line.
      const sampled = resample(canonical, 10).map(p =>
        p.slice(0, 2).map(v => Number(v.toFixed(5))),
      );
      return JSON.stringify(sampled);
    })
    .sort();
  return hash(lines);
}

/** Uses the exact canonical loader as the detail view, inside the same document-write transaction. */
export async function rebuildRecommendationFeatures(
  tx: Prisma.TransactionClient,
  resortId: string,
) {
  const hashes = new Map<string, string>();
  // All reads share one transaction connection; serialize and deduplicate them.
  let queue = Promise.resolve();
  const pending = new Map<string, ReturnType<typeof readMapOrDataDocument>>();
  const loadDocument = (key: string) => {
    let result = pending.get(key);
    if (!result) {
      result = queue.then(() => readMapOrDataDocument(tx, key));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      pending.set(key, result);
    }
    return result;
  };
  const { data } = await buildResortMapData(resortId, {
    temporaryRoot: TEMPORARY_RESORTS_ROOT,
    latestStatusLoader: async () => null,
    documentLoader: async absolutePath => {
      const key = path
        .relative(path.resolve(process.cwd(), "src/private/data"), absolutePath)
        .split(path.sep)
        .join("/");
      const document = await loadDocument(key);
      hashes.set(key, document?.hash ?? "absent");
      return document?.content ?? null;
    },
  });
  const courses = data?.courses?.features ?? [];
  const features = extractCourseFeatures(resortId, courses);
  const sourceHash = hash([...hashes].sort(([a], [b]) => a.localeCompare(b)));
  await tx.courseRecommendationFeature.deleteMany({ where: { resortId } });
  if (features.length)
    await tx.courseRecommendationFeature.createMany({
      data: features.map(feature => ({
        ...feature,
        geometryHash: geometryFingerprint(courses, feature.courseIds),
        sourceHash,
        calculationVersion: RECOMMENDATION.version,
      })),
    });
  return {
    resortId,
    inputLines: courses.length,
    eligibleCourses: features.length,
    sourceHash,
  };
}
export async function syncRecommendationDocuments(
  tx: Prisma.TransactionClient,
  keys: readonly string[],
) {
  const ids = new Set(
    keys.map(recommendationResortId).filter((id): id is string => id !== null),
  );
  for (const id of ids) await rebuildRecommendationFeatures(tx, id);
}
