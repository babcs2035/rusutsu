import { createHash } from "node:crypto";
import {
  featureIdentity,
  legacyCourseGrouping,
  readCourseGrouping,
} from "@/shared/course-lift/identity";

export type MapSourceDocument = {
  key: string;
  content: string;
  hash: string;
  mediaType: string;
  version: number;
};
export type MapFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: unknown;
  [key: string]: unknown;
};
export const MAP_ENTITIES_MIGRATION_KEY = "map-entities-v1";
export const contentHash = (content: string) =>
  createHash("sha256").update(content).digest("hex");
export function primaryMapKey(key: string) {
  const m =
    /^resorts-temporary\/(slope_before(?:_osm)?|lift_before)\/([a-z0-9-]+)\.geojson$/u.exec(
      key,
    );
  return m
    ? {
        kind: m[1] === "lift_before" ? ("lift" as const) : ("course" as const),
        resortId: m[2],
        sourceKind: m[1].endsWith("_osm") ? "osm" : "curated",
      }
    : null;
}
export function derivedKey(key: string) {
  return key
    .replace("slope_before_osm/", "slope_10m_osm/")
    .replace("slope_before/", "slope_10m/")
    .replace("lift_before/", "lift_20m/");
}
export function readCollection(content: string): {
  type: "FeatureCollection";
  features: MapFeature[];
  [key: string]: unknown;
} {
  const data = JSON.parse(content);
  if (
    data?.type !== "FeatureCollection" ||
    !Array.isArray(data.features) ||
    data.features.some(
      (f: MapFeature) => f?.type !== "Feature" || !("geometry" in f),
    )
  )
    throw new Error("Invalid GeoJSON collection");
  return data;
}
export function makeMapMigrationPlan(documents: MapSourceDocument[]) {
  const byKey = new Map(documents.map(d => [d.key, d]));
  if (byKey.size !== documents.length)
    throw new Error("Duplicate document keys");
  for (const d of documents)
    if (contentHash(d.content) !== d.hash)
      throw new Error(`Hash mismatch: ${d.key}`);
  const changes = new Map<string, MapSourceDocument>();
  const entities: {
    id: string;
    key: string;
    index: number;
    kind: "course" | "lift";
  }[] = [];
  const issues: string[] = [];
  const allIds = new Set<string>();
  const primaryFeatures = new Map<string, MapFeature[]>();
  const replace = (d: MapSourceDocument, value: unknown) => {
    const content = JSON.stringify(value);
    if (content !== d.content)
      changes.set(d.key, { ...d, content, hash: contentHash(content) });
  };
  for (const d of documents) {
    const source = primaryMapKey(d.key);
    if (!source) continue;
    const collection = readCollection(d.content);
    const features = collection.features.map((feature, index) => {
      const id = featureIdentity(feature.properties, d.key, index);
      if (allIds.has(id)) throw new Error(`Duplicate entity ID: ${id}`);
      allIds.add(id);
      entities.push({ id, key: d.key, index, kind: source.kind });
      const props: Record<string, unknown> = {
        ...(feature.properties ?? {}),
        entityId: id,
      };
      if (source.kind === "course") {
        const grouping = Object.hasOwn(props, "courseGrouping")
          ? readCourseGrouping(props.courseGrouping)
          : legacyCourseGrouping(
              String(props.name ?? ""),
              `${source.resortId}:${source.sourceKind}`,
            );
        if (props.courseGrouping != null && !grouping)
          throw new Error(`Invalid grouping: ${d.key} #${index}`);
        Object.assign(props, { courseGrouping: grouping });
      }
      return { ...feature, properties: props };
    });
    // Make legacy section orders contiguous, without changing collection/display order.
    const groups = new Map<string, typeof features>();
    for (const f of features) {
      const g = readCourseGrouping(f.properties.courseGrouping);
      if (g) groups.set(g.id, [...(groups.get(g.id) ?? []), f]);
    }
    for (const members of groups.values())
      members
        .sort(
          (a, b) =>
            (readCourseGrouping(a.properties.courseGrouping)?.order ?? 0) -
            (readCourseGrouping(b.properties.courseGrouping)?.order ?? 0),
        )
        .forEach((f, i) => {
          f.properties.courseGrouping = {
            ...readCourseGrouping(f.properties.courseGrouping),
            order: i + 1,
          };
        });
    primaryFeatures.set(d.key, features);
    replace(d, { ...collection, features });
    const derived = byKey.get(derivedKey(d.key));
    if (!derived) continue;
    const dc = readCollection(derived.content);
    const used = new Set<string>();
    const dfs = dc.features.map((f, index) => {
      const matches = features.filter(b =>
        f.properties?.entityId
          ? b.properties.entityId === f.properties.entityId
          : f.properties?.name != null &&
            b.properties.name === f.properties.name,
      );
      if (
        matches.length !== 1 ||
        used.has(String(matches[0].properties.entityId))
      ) {
        issues.push(
          `Derived retained without association: ${derived.key} #${index}`,
        );
        return f;
      }
      const b = matches[0];
      used.add(String(b.properties.entityId));
      return {
        ...f,
        properties: {
          ...f.properties,
          entityId: b.properties.entityId,
          ...(source.kind === "course"
            ? { courseGrouping: b.properties.courseGrouping }
            : {}),
        },
      };
    });
    replace(derived, { ...dc, features: dfs });
  }
  // Preserve all mapping rows; legacy name associations fan out only within their existing name.
  for (const d of documents) {
    const m =
      /^resorts-temporary\/latest_status_mapping\/([a-z0-9-]+)\.json$/u.exec(
        d.key,
      );
    if (!m) continue;
    const data = JSON.parse(d.content);
    for (const kind of ["courses", "lifts"] as const) {
      if (!Array.isArray(data[kind]?.rows)) continue;
      const features = [...primaryFeatures]
        .filter(([key]) => {
          const s = primaryMapKey(key);
          return (
            s?.resortId === m[1] &&
            s.kind === (kind === "courses" ? "course" : "lift")
          );
        })
        .flatMap(([, fs]) => fs);
      data[kind].rows = data[kind].rows.flatMap(
        (row: Record<string, unknown>) => {
          if (row.geometryId || !row.geojsonName) return [row];
          const matches = features.filter(
            f => f.properties?.name === row.geojsonName,
          );
          return matches.length
            ? matches.map(f => ({ ...row, geometryId: f.properties?.entityId }))
            : [row];
        },
      );
    }
    replace(d, data);
  }
  // Verify transformation removed no original fields except explicitly derived identity metadata.
  for (const d of documents) {
    const changed = changes.get(d.key);
    if (!changed || !d.key.endsWith(".geojson")) continue;
    const old = readCollection(d.content),
      next = readCollection(changed.content);
    if (old.features.length !== next.features.length)
      throw new Error(`Feature loss: ${d.key}`);
    old.features.forEach((f, i) => {
      const after = next.features[i];
      for (const [key, value] of Object.entries(f)) {
        if (key === "properties") continue;
        if (JSON.stringify(value) !== JSON.stringify(after[key]))
          throw new Error(`Feature changed: ${d.key} #${i}`);
      }
      for (const [key, value] of Object.entries(f.properties ?? {})) {
        if (["entityId", "courseGrouping"].includes(key)) continue;
        if (JSON.stringify(value) !== JSON.stringify(after.properties?.[key]))
          throw new Error(`Property changed: ${d.key} #${i} ${key}`);
      }
    });
  }
  return {
    changes: [...changes.values()],
    entities,
    issues,
    documents: documents.map(d => changes.get(d.key) ?? d),
  };
}
