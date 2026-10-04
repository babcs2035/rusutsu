import { DETAIL_LABELS } from "@/features/lift/constants";
import type { EditPlan } from "@/server/edit-requests/contract";
import { featureIdentity } from "@/shared/course-lift/identity";

type LiftFeature = {
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
};
type LocatedFeature = { feature: LiftFeature; resortId: string; index: number };
type MappingRow = {
  geometryId?: string;
  crawledName?: string | null;
  crawledNames?: string[];
  geojsonName?: string | null;
};
type MappingSection = { rows?: MappingRow[] };

export type LiftReviewField = {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};
export type LiftReviewItem = {
  id: string;
  name: string;
  status: "added" | "removed" | "changed" | "unchanged";
  fields: LiftReviewField[];
  geometryChanged: boolean;
  movedFrom: string | null;
  movedTo: string | null;
  mappingNames: string[];
  mapName: string | null;
  mappingChanged: boolean;
};
export type LiftReview = {
  items: LiftReviewItem[];
  changedCount: number;
  mappingCount: number;
  orderChanged: boolean;
};

const FIELD_ORDER = [
  "name",
  "aerialway",
  "type",
  "speed",
  "capacity",
  "distance",
  "vertical",
  "top",
  "bottom",
  "midstation",
  "hood",
  "footrest",
  "towers",
  "oilShield",
  "maker",
  "year",
  "morning",
  "night",
  "note",
  "searchWord",
  "link",
];
const INTERNAL_KEYS = new Set(["entityId", "@id", "resort"]);
const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  aerialway: "設備の種類",
  midstation: "中間駅",
  ...DETAIL_LABELS,
};
const AERIALWAY_LABELS: Record<string, string> = {
  chair_lift: "リフト",
  gondola: "ゴンドラ",
  cable_car: "ケーブルカー",
  drag_lift: "シュレップリフト",
  magic_carpet: "動く歩道",
  mixed_lift: "コンビリフト",
};

function readable(value: unknown, key: string): string {
  if (value === undefined || value === null || value === "") return "未設定";
  if (value === "○") return "あり";
  if (value === "×") return "なし";
  if (key === "aerialway" && typeof value === "string")
    return AERIALWAY_LABELS[value] ?? value;
  if (key === "midstation") return "あり";
  if (typeof value === "object") return "設定あり";
  return String(value);
}

function parseFeatures(content: string): LiftFeature[] {
  const parsed = JSON.parse(content) as { features?: LiftFeature[] };
  return Array.isArray(parsed.features) ? parsed.features : [];
}

function featureMap(plan: EditPlan, before: boolean) {
  const result = new Map<string, LocatedFeature>();
  const order: string[] = [];
  const documents = before
    ? plan.beforeDocuments.flatMap(item =>
        item.document
          ? [{ key: item.key, content: item.document.content }]
          : [],
      )
    : plan.documents;
  for (const document of documents) {
    if (!document.key.includes("/lift_before/")) continue;
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

function mappingRows(plan: EditPlan, before: boolean): MappingRow[] {
  const documents = before
    ? plan.beforeDocuments.flatMap(item =>
        item.document
          ? [{ key: item.key, content: item.document.content }]
          : [],
      )
    : plan.documents;
  return documents.flatMap(document => {
    if (!document.key.includes("/latest_status_mapping/")) return [];
    const parsed = JSON.parse(document.content) as { lifts?: MappingSection };
    return parsed.lifts?.rows ?? [];
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

export function buildLiftReview(plan: EditPlan): LiftReview {
  const before = featureMap(plan, true);
  const after = featureMap(plan, false);
  const beforeMappings = mappingRows(plan, true);
  const afterMappings = mappingRows(plan, false);
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
    const keys = [
      ...new Set([...Object.keys(oldProperties), ...Object.keys(properties)]),
    ]
      .filter(key => !INTERNAL_KEYS.has(key))
      .sort((a, b) => {
        const ai = FIELD_ORDER.indexOf(a),
          bi = FIELD_ORDER.indexOf(b);
        return (
          (ai < 0 ? 1000 : ai) - (bi < 0 ? 1000 : bi) || a.localeCompare(b)
        );
      });
    const fields = keys.map(key => {
      const changed =
        JSON.stringify(oldProperties[key]) !== JSON.stringify(properties[key]);
      return {
        key,
        label: FIELD_LABELS[key] ?? `その他: ${key}`,
        before: readable(oldProperties[key], key),
        after:
          key === "midstation" &&
          oldProperties[key] &&
          properties[key] &&
          changed
            ? "位置を変更"
            : readable(properties[key], key),
        changed,
      };
    });
    const geometryChanged = Boolean(
      old &&
        next &&
        JSON.stringify(old.feature.geometry) !==
          JSON.stringify(next.feature.geometry),
    );
    const name = properties.name ?? oldProperties.name;
    const displayName =
      typeof name === "string" && name.trim() ? name : "名称未設定のリフト";
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
    } satisfies LiftReviewItem;
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
