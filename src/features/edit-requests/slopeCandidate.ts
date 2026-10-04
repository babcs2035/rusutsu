import type { SaveCoursePayload, SaveRequest } from "@/features/slope/types";
import { featureIdentity } from "@/shared/course-lift/identity";
import { renameMappedGeometry } from "./candidateMapping";

const NUMERIC_COURSE_KEYS = new Set(["distance", "avg", "max"]);

export function slopeCandidate(payload: unknown): SaveRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as SaveRequest;
  if (
    typeof candidate.resortId !== "string" ||
    (candidate.sourceKind !== "curated" && candidate.sourceKind !== "osm") ||
    !Array.isArray(candidate.courses)
  )
    return null;
  if (
    candidate.courses.some(
      course =>
        !course ||
        typeof course.targetSkiId !== "string" ||
        !course.properties ||
        typeof course.properties !== "object" ||
        !Array.isArray(course.coordinates),
    )
  )
    return null;
  return candidate;
}

export function slopeDocumentKey(candidate: SaveRequest, resortId: string) {
  return `resorts-temporary/${candidate.sourceKind === "osm" ? "slope_before_osm" : "slope_before"}/${resortId}.geojson`;
}

export function candidateCourseId(
  candidate: SaveRequest,
  course: SaveCoursePayload,
  index: number,
): string {
  return featureIdentity(
    course.properties,
    slopeDocumentKey(candidate, candidate.resortId),
    index,
  );
}

/** 申請の対象・更新基準・関連リンク・他のコースはそのまま残す。 */
export function updateCandidateCourse(
  candidate: SaveRequest,
  id: string,
  update: (course: SaveCoursePayload) => SaveCoursePayload,
): SaveRequest {
  const index = candidate.courses.findIndex(
    (course, index) => candidateCourseId(candidate, course, index) === id,
  );
  if (index < 0) return candidate;
  const previous = candidate.courses[index];
  const next = update(previous);
  const courses = candidate.courses.map((course, i) =>
    i === index ? next : course,
  );
  if (previous.properties.name === next.properties.name || !candidate.mapping)
    return { ...candidate, courses };
  return {
    ...candidate,
    courses,
    mapping: renameMappedGeometry(
      candidate.mapping,
      candidate.resortId,
      id,
      candidate.courses,
      courses,
      previous.properties.name,
      String(next.properties.name ?? ""),
    ),
  };
}

/** slope_before の properties と slope_detail 用の detail を同じ値にそろえる。 */
export function updateCourseProperty(
  course: SaveCoursePayload,
  key: string,
  value: string,
): SaveCoursePayload {
  const parsed =
    NUMERIC_COURSE_KEYS.has(key) &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : value;
  const properties: Record<string, unknown> = {
    ...course.properties,
    [key]: parsed,
  };
  if (key === "name") properties.nameUnknown = value.trim() === "";
  return {
    ...course,
    properties,
    detail: { ...course.detail, [key]: parsed },
  };
}
