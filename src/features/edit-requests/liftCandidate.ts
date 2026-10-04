import { NUMERIC_DETAIL_KEYS } from "@/features/lift/constants";
import type { SaveLiftPayload, SaveRequest } from "@/features/lift/types";
import { featureIdentity } from "@/shared/course-lift/identity";

export function liftCandidate(payload: unknown): SaveRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as SaveRequest;
  if (typeof candidate.resortId !== "string" || !Array.isArray(candidate.lifts))
    return null;
  if (
    candidate.lifts.some(
      lift =>
        !lift ||
        typeof lift.targetSkiId !== "string" ||
        !lift.properties ||
        typeof lift.properties !== "object" ||
        !Array.isArray(lift.coordinates),
    )
  )
    return null;
  return candidate;
}

export function candidateLiftId(
  candidate: SaveRequest,
  lift: SaveLiftPayload,
  index: number,
): string {
  return featureIdentity(
    lift.properties,
    `resorts-temporary/lift_before/${candidate.resortId}.geojson`,
    index,
  );
}

/** Keep the original request scope, hashes, links and unrelated lifts intact. */
export function updateCandidateLift(
  candidate: SaveRequest,
  id: string,
  update: (lift: SaveLiftPayload) => SaveLiftPayload,
): SaveRequest {
  const index = candidate.lifts.findIndex(
    (lift, index) => candidateLiftId(candidate, lift, index) === id,
  );
  if (index < 0) return candidate;
  const previous = candidate.lifts[index];
  const next = update(previous);
  const lifts = candidate.lifts.map((lift, i) => (i === index ? next : lift));
  if (previous.properties.name === next.properties.name || !candidate.mapping)
    return { ...candidate, lifts };
  const oldName = previous.properties.name;
  const newName = String(next.properties.name ?? "");
  const uniqueName =
    candidate.lifts.filter(lift => lift.properties.name === oldName).length ===
    1;
  return {
    ...candidate,
    lifts,
    mapping: {
      ...candidate.mapping,
      rows: candidate.mapping.rows.map(row =>
        row.geometryId === id ||
        (!row.geometryId && uniqueName && row.geojsonName === oldName)
          ? { ...row, geojsonName: newName }
          : row,
      ),
      ...(candidate.mapping.geometries && {
        geometries: candidate.mapping.geometries.map(line =>
          line.id === id ? { ...line, name: newName } : line,
        ),
      }),
      ...(candidate.mapping.geojsonNames && {
        geojsonNames: lifts
          .filter(lift => lift.targetSkiId === candidate.resortId)
          .map(lift => String(lift.properties.name ?? ""))
          .filter(Boolean),
      }),
    },
  };
}

export function updateLiftProperty(
  lift: SaveLiftPayload,
  key: string,
  value: string,
): SaveLiftPayload {
  const properties = { ...lift.properties };
  if (value === "") delete properties[key];
  else
    properties[key] =
      NUMERIC_DETAIL_KEYS.some(numericKey => numericKey === key) &&
      Number.isFinite(Number(value))
        ? Number(value)
        : value;
  return { ...lift, properties };
}
