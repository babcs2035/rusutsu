import { featureIdentity } from "./identity";

type Feature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
};
/** Preserve top-level foreign members and Z values when the edited XY line is unchanged. */
export function preserveFeature<T extends Feature>(
  next: T,
  originals: T[],
  documentKey: string,
): T {
  const id = next.properties?.entityId;
  const old = originals.find(
    (f, i) => featureIdentity(f.properties, documentKey, i) === id,
  );
  if (!old) return next;
  const a = old.geometry?.coordinates,
    b = next.geometry?.coordinates;
  const same =
    old.geometry?.type === next.geometry?.type &&
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every(
      (p, i) =>
        Array.isArray(p) &&
        Array.isArray(b[i]) &&
        p[0] === b[i][0] &&
        p[1] === b[i][1],
    );
  return { ...old, ...next, geometry: same ? old.geometry : next.geometry };
}
