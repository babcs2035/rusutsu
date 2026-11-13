import type { CorrectionFeature } from "@/server/corrections/features";

export type { CorrectionFeature };
export type CorrectionKind = "slope" | "lift";
export type Mark = "○" | "△" | "×" | null;

/** 送信する1件。サーバーの correctionItemSchema と同じ形 */
export type CorrectionEntry = {
  targetKind: "slope" | "lift" | "other";
  targetId?: string;
  targetName?: string;
  field: string;
  before?: unknown;
  proposed: unknown;
  action?: "change" | "add" | "delete";
};

/** 位置の編集中の線。新しく描いた線と、削除を提案した線の印を持つ */
export type CorrectionLine = {
  id: string;
  kind: CorrectionKind;
  name: string;
  coordinates: [number, number][];
  isNew?: boolean;
  deleted?: boolean;
};

/** 項目の修正。線のID → 項目名 → 修正後の値。現在の登録と同じ値は持たない */
export type PropEdits = Record<string, Record<string, unknown>>;

export const SLOPE_DETAIL_FIELDS = [
  "name",
  "level",
  "piste",
  "morning",
  "night",
] as const;
export const LIFT_DETAIL_FIELDS = [
  "name",
  "type",
  "speed",
  "hood",
  "morning",
  "night",
  "oilShield",
  "footrest",
  "towers",
  "maker",
  "year",
] as const;

export const FIELD_LABELS: Record<string, string> = {
  name: "名前",
  level: "難易度",
  piste: "圧雪",
  morning: "早朝営業",
  night: "ナイター",
  type: "種類",
  speed: "速度",
  hood: "フード",
  oilShield: "油よけカバー",
  footrest: "フットレスト",
  towers: "支柱数",
  maker: "索道メーカー",
  year: "設置年",
};

export const LEVEL_VALUES = ["初級", "初中級", "中級", "中上級", "上級"];
export const LIFT_TYPE_VALUES = [
  "リフト",
  "ゴンドラ",
  "ロープウェイ",
  "コンビ",
  "ケーブルカー",
  "シュレップ",
  "ロープトゥ",
  "エスカレーター",
];
export const SPEED_VALUES = ["高速", "低速"];

const MARK_FIELDS = new Set([
  "piste",
  "morning",
  "night",
  "hood",
  "footrest",
  "oilShield",
]);
const NUMBER_FIELDS = new Set(["towers", "year"]);
/** 区間ごとの値を持てる項目（コースだけ） */
export const SEGMENT_FIELDS = ["piste", "morning", "night"] as const;

export const isMarkField = (field: string) => MARK_FIELDS.has(field);
export const isNumberField = (field: string) => NUMBER_FIELDS.has(field);

/** ○・×（圧雪だけ△も）以外は「不明」として扱う */
export const toMark = (value: unknown, field: string): Mark =>
  value === "○" || value === "×" || (field === "piste" && value === "△")
    ? value
    : null;

/** 比べられる形にそろえた値。空文字や形の合わない値は null（未登録） */
export const normalizeValue = (field: string, value: unknown): unknown => {
  if (isMarkField(field)) return toMark(value, field);
  if (isNumberField(field)) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** 区間ごとに値が分かれているか（コース全体では1つの値に決まらない） */
export const hasSegments = (feature: CorrectionFeature, field: string) => {
  const segments = feature.properties[`${field}Segments`];
  return Array.isArray(segments) && segments.length > 0;
};

export const currentValue = (feature: CorrectionFeature, field: string) =>
  normalizeValue(field, feature.properties[field]);

/** 修正後の値。修正していなければ現在の登録 */
export const editedValue = (
  edits: PropEdits,
  feature: CorrectionFeature,
  field: string,
) => {
  const edit = edits[feature.id];
  return edit && field in edit ? edit[field] : currentValue(feature, field);
};

export const isEdited = (edits: PropEdits, id: string, field: string) =>
  Boolean(edits[id] && field in edits[id]);

/**
 * 送信しない入力。名前を空にしただけの状態は、打ち直しの途中として扱う
 * （線ごと消したいときは位置の画面で削除を提案する）。
 */
export const isBlankName = (field: string, proposed: unknown) =>
  field === "name" && proposed === null;

/** その線で送信される項目の数 */
export const editCount = (edits: PropEdits, id: string) =>
  Object.entries(edits[id] ?? {}).filter(
    ([field, proposed]) => !isBlankName(field, proposed),
  ).length;

/** 値を1つ変える。現在の登録に戻したら修正から外す */
export const setEdit = (
  edits: PropEdits,
  feature: CorrectionFeature,
  field: string,
  value: unknown,
): PropEdits => {
  const proposed = normalizeValue(field, value);
  const rest = { ...edits[feature.id] };
  delete rest[field];
  // 区間別のコースは、現在の登録と同じ値を選んでも「全体をその値にする」修正になる
  const unchanged =
    proposed === currentValue(feature, field) && !hasSegments(feature, field);
  const next = unchanged ? rest : { ...rest, [field]: proposed };
  const others = { ...edits };
  delete others[feature.id];
  return Object.keys(next).length ? { ...others, [feature.id]: next } : others;
};

/** 修正を取り消して現在の登録に戻す（区間別のコースを元に戻すときに使う） */
export const clearEdit = (
  edits: PropEdits,
  id: string,
  field: string,
): PropEdits => {
  const rest = { ...edits[id] };
  delete rest[field];
  const others = { ...edits };
  delete others[id];
  return Object.keys(rest).length ? { ...others, [id]: rest } : others;
};

const MARK_TEXT: Record<string, Record<string, string>> = {
  piste: { "○": "圧雪", "△": "日によって圧雪", "×": "非圧雪" },
};
export const valueText = (field: string, value: unknown) => {
  if (value === null || value === undefined || value === "")
    return isMarkField(field) ? "不明" : "未登録";
  if (isMarkField(field))
    return (
      MARK_TEXT[field]?.[String(value)] ?? (value === "○" ? "あり" : "なし")
    );
  return String(value);
};

const sameCoordinates = (a: [number, number][], b: [number, number][]) =>
  a.length === b.length &&
  a.every(
    (point, index) => point[0] === b[index]?.[0] && point[1] === b[index]?.[1],
  );

export const lineChange = (
  line: CorrectionLine,
  original: CorrectionFeature | undefined,
): "add" | "delete" | "change" | null => {
  if (line.isNew) return line.coordinates.length >= 2 ? "add" : null;
  if (!original) return null;
  if (line.deleted) return "delete";
  return sameCoordinates(line.coordinates, original.coordinates)
    ? null
    : "change";
};

export const linesFromFeatures = (
  features: CorrectionFeature[],
): CorrectionLine[] =>
  features.map(feature => ({
    id: feature.id,
    kind: feature.kind,
    name: feature.name,
    coordinates: feature.coordinates.map(
      point => [point[0], point[1]] as [number, number],
    ),
  }));

const KIND_LABEL = { slope: "コース", lift: "リフト" } as const;

/** 送信内容の確認に出す1行 */
export type ChangeSummary = { key: string; target: string; text: string };

type Draft = {
  features: CorrectionFeature[];
  lines: CorrectionLine[];
  edits: PropEdits;
  otherText: string;
};

/** いま入力されている修正を、確認用の文と送信用の項目にまとめる */
export function buildCorrection({ features, lines, edits, otherText }: Draft): {
  items: CorrectionEntry[];
  summary: ChangeSummary[];
} {
  const byId = new Map(features.map(feature => [feature.id, feature]));
  const items: CorrectionEntry[] = [];
  const summary: ChangeSummary[] = [];

  for (const line of lines) {
    const original = byId.get(line.id);
    const change = lineChange(line, original);
    if (!change) continue;
    const name = line.name.trim() || `名称未設定の${KIND_LABEL[line.kind]}`;
    items.push({
      targetKind: line.kind,
      targetId: line.id,
      targetName: name,
      field: "coordinates",
      ...(original ? { before: original.coordinates } : {}),
      proposed:
        change === "delete" && original
          ? original.coordinates
          : line.coordinates,
      action: change,
    });
    summary.push({
      key: `line:${line.id}`,
      target: name,
      text:
        change === "add"
          ? `新しい${KIND_LABEL[line.kind]}を追加`
          : change === "delete"
            ? `${KIND_LABEL[line.kind]}の削除`
            : "位置を変更",
    });
  }

  for (const feature of features) {
    const edit = edits[feature.id];
    if (!edit) continue;
    for (const [field, proposed] of Object.entries(edit)) {
      if (isBlankName(field, proposed)) continue;
      const segmented = feature.kind === "slope" && hasSegments(feature, field);
      items.push({
        targetKind: feature.kind,
        targetId: feature.id,
        targetName: feature.name,
        field,
        before: feature.properties[field],
        proposed,
      });
      // コース全体の値を決めたら、区間ごとの設定は外す
      if (segmented)
        items.push({
          targetKind: feature.kind,
          targetId: feature.id,
          targetName: feature.name,
          field: `${field}Segments`,
          before: feature.properties[`${field}Segments`],
          proposed: [],
        });
      summary.push({
        key: `edit:${feature.id}:${field}`,
        target: feature.name,
        text: `${FIELD_LABELS[field] ?? field}: ${
          segmented ? "区間別" : valueText(field, currentValue(feature, field))
        } → ${valueText(field, proposed)}`,
      });
    }
  }

  const text = otherText.trim();
  if (text) {
    items.push({ targetKind: "other", field: "other-report", proposed: text });
    summary.push({ key: "other", target: "その他", text });
  }
  return { items, summary };
}

/** メニューで「修正」と「追加」のどちらの文言にするかを決める材料 */
export function correctionAvailability(features: CorrectionFeature[]) {
  const slopes = features.filter(feature => feature.kind === "slope");
  const lifts = features.filter(feature => feature.kind === "lift");
  const has = (list: CorrectionFeature[], fields: readonly string[]) =>
    list.some(feature =>
      fields.some(
        field =>
          currentValue(feature, field) !== null || hasSegments(feature, field),
      ),
    );
  return {
    slopeCount: slopes.length,
    liftCount: lifts.length,
    // 名前は線を描いた時点で付くので、詳細が入っているかの判断には使わない
    slopeDetails: has(slopes, SLOPE_DETAIL_FIELDS.slice(1)),
    liftDetails: has(lifts, LIFT_DETAIL_FIELDS.slice(1)),
    piste: has(slopes, ["piste"]),
    morning: has(features, ["morning"]),
    night: has(features, ["night"]),
  };
}
