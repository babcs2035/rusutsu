import type { EditPlan } from "@/server/edit-requests/contract";
import { featureIdentity } from "@/shared/course-lift/identity";

type ReviewFeature = {
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
};
type LocatedFeature = {
  feature: ReviewFeature;
  resortId: string;
  index: number;
};
type MappingRow = {
  geometryId?: string;
  crawledName?: string | null;
  crawledNames?: string[];
  geojsonName?: string | null;
};
type MappingSection = { rows?: MappingRow[] };

export type FeatureReviewField = {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};
export type FeatureReviewItem = {
  id: string;
  name: string;
  status: "added" | "removed" | "changed" | "unchanged";
  fields: FeatureReviewField[];
  geometryChanged: boolean;
  movedFrom: string | null;
  movedTo: string | null;
  mappingNames: string[];
  mapName: string | null;
  mappingChanged: boolean;
};
export type FeatureReview = {
  items: FeatureReviewItem[];
  changedCount: number;
  mappingCount: number;
  orderChanged: boolean;
};

export type FeatureReviewConfig = {
  /** 申請の文書のうち、線と属性を持つ GeoJSON の文書キーか */
  isFeatureDocument: (key: string) => boolean;
  mappingSection: "lifts" | "courses";
  fieldOrder: string[];
  internalKeys: Set<string>;
  labels: Record<string, string>;
  /** 既知の項目以外は、変更があるときだけ表示する */
  hideUnchangedUnknown?: boolean;
  readable: (value: unknown, key: string) => string;
  unnamed: string;
};

function parseFeatures(content: string): ReviewFeature[] {
  const parsed = JSON.parse(content) as { features?: ReviewFeature[] };
  return Array.isArray(parsed.features) ? parsed.features : [];
}

function planDocuments(plan: EditPlan, before: boolean) {
  return before
    ? plan.beforeDocuments.flatMap(item =>
        item.document
          ? [{ key: item.key, content: item.document.content }]
          : [],
      )
    : plan.documents;
}

function featureMap(
  plan: EditPlan,
  before: boolean,
  config: FeatureReviewConfig,
) {
  const result = new Map<string, LocatedFeature>();
  const order: string[] = [];
  for (const document of planDocuments(plan, before)) {
    if (!config.isFeatureDocument(document.key)) continue;
    const resortId =
      document.key
        .split("/")
        .at(-1)
        ?.replace(/\.geojson$/u, "") ?? "";
    parseFeatures(document.content).forEach((feature, index) => {
      const id = featureIdentity(feature.properties, document.key, index);
      result.set(id, { feature, resortId, index });
      order.push(id);
    });
  }
  return { result, order };
}

function mappingRows(
  plan: EditPlan,
  before: boolean,
  section: FeatureReviewConfig["mappingSection"],
): MappingRow[] {
  return planDocuments(plan, before).flatMap(document => {
    if (!document.key.includes("/latest_status_mapping/")) return [];
    const parsed = JSON.parse(document.content) as Record<
      string,
      MappingSection | undefined
    >;
    return parsed[section]?.rows ?? [];
  });
}

function mappingFor(
  rows: MappingRow[],
  id: string,
  name: string,
  nameCounts: Map<string, number>,
): MappingRow | null {
  return (
    rows.find(row => row.geometryId === id) ??
    (nameCounts.get(name) === 1
      ? rows.find(row => !row.geometryId && row.geojsonName === name)
      : undefined) ??
    null
  );
}

function names(row: MappingRow | null): string[] {
  if (!row) return [];
  return [...new Set([row.crawledName, ...(row.crawledNames ?? [])])].filter(
    (name): name is string => typeof name === "string" && name.trim() !== "",
  );
}

/** 申請前後の線を ID で突き合わせ、1本ごとの変更点にまとめる。 */
export function buildFeatureReview(
  plan: EditPlan,
  config: FeatureReviewConfig,
): FeatureReview {
  const before = featureMap(plan, true, config);
  const after = featureMap(plan, false, config);
  const beforeMappings = mappingRows(plan, true, config.mappingSection);
  const afterMappings = mappingRows(plan, false, config.mappingSection);
  const nameCounts = new Map<string, number>();
  for (const located of after.result.values()) {
    const name = located.feature.properties?.name;
    if (typeof name === "string")
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const ids = [...new Set([...after.order, ...before.order])];
  const items = ids.map(id => {
    const old = before.result.get(id);
    const next = after.result.get(id);
    const oldProperties = old?.feature.properties ?? {};
    const properties = next?.feature.properties ?? {};
    const fields = [
      ...new Set([...Object.keys(oldProperties), ...Object.keys(properties)]),
    ]
      .filter(key => !config.internalKeys.has(key))
      .map(key => ({
        key,
        changed:
          JSON.stringify(oldProperties[key] ?? "") !==
          JSON.stringify(properties[key] ?? ""),
      }))
      .filter(
        ({ key, changed }) =>
          changed ||
          !config.hideUnchangedUnknown ||
          config.fieldOrder.includes(key),
      )
      .sort((a, b) => {
        const ai = config.fieldOrder.indexOf(a.key),
          bi = config.fieldOrder.indexOf(b.key);
        return (
          (ai < 0 ? 1000 : ai) - (bi < 0 ? 1000 : bi) ||
          a.key.localeCompare(b.key)
        );
      })
      .map(({ key, changed }) => ({
        key,
        label: config.labels[key] ?? `その他: ${key}`,
        before: config.readable(oldProperties[key], key),
        after:
          key === "midstation" &&
          oldProperties[key] &&
          properties[key] &&
          changed
            ? "位置を変更"
            : config.readable(properties[key], key),
        changed,
      }));
    const geometryChanged = Boolean(
      old &&
        next &&
        JSON.stringify(old.feature.geometry) !==
          JSON.stringify(next.feature.geometry),
    );
    const name = properties.name ?? oldProperties.name;
    const displayName =
      typeof name === "string" && name.trim() ? name : config.unnamed;
    const oldName =
      typeof oldProperties.name === "string" ? oldProperties.name : displayName;
    const previousMapping = mappingFor(beforeMappings, id, oldName, nameCounts);
    const currentMapping = mappingFor(
      afterMappings,
      id,
      displayName,
      nameCounts,
    );
    const mappingNames = names(currentMapping);
    const mappingChanged =
      JSON.stringify({
        names: names(previousMapping),
        mapName: previousMapping?.geojsonName ?? null,
      }) !==
      JSON.stringify({
        names: mappingNames,
        mapName: currentMapping?.geojsonName ?? null,
      });
    const moved = Boolean(old && next && old.resortId !== next.resortId);
    const changed =
      fields.some(field => field.changed) ||
      geometryChanged ||
      moved ||
      mappingChanged;
    return {
      id,
      name: displayName,
      status: !old
        ? "added"
        : !next
          ? "removed"
          : changed
            ? "changed"
            : "unchanged",
      fields,
      geometryChanged,
      movedFrom: moved ? (old?.resortId ?? null) : null,
      movedTo: moved ? (next?.resortId ?? null) : null,
      mappingNames,
      mapName: currentMapping?.geojsonName ?? null,
      mappingChanged,
    } satisfies FeatureReviewItem;
  });
  const beforeOrder = before.order.filter(id => after.result.has(id));
  const afterOrder = after.order.filter(id => before.result.has(id));
  return {
    items,
    changedCount: items.filter(item => item.status !== "unchanged").length,
    mappingCount: items.filter(item => item.mappingNames.length > 0).length,
    orderChanged: JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder),
  };
}
