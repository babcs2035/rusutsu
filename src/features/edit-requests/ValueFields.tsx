"use client";
import { useState } from "react";

const LABELS: Record<string, string> = {
  resortId: "スキー場ID",
  targetSkiId: "編集対象のスキー場ID",
  officialSiteUrls: "公式サイト",
  mapUrls: "コースマップ",
  request: "変更内容",
  data: "データ",
  content: "内容",
  nameJa: "名称",
  nameEn: "英語名",
  shortName: "省略名",
  name: "名称",
  nameRuby: "ふりがな",
  ruby: "読み",
  text: "本文",
  formerNames: "旧称",
  readingNeedsReview: "読みの要確認",
  isActive: "公開",
  prefecture: "都道府県",
  town: "市町村",
  latitude: "緯度",
  longitude: "経度",
  topElevation: "最高標高",
  baseElevation: "最低標高",
  verticalDrop: "標高差",
  numberOfCourses: "コース数",
  longestCourse: "最長距離",
  steepestSlope: "最大斜度",
  numberOfLifts: "リフト数",
  website: "公式サイト",
  descriptionShort: "短い説明",
  descriptionLong: "説明",
  properties: "詳細",
  coordinates: "座標（経度・緯度）",
  lifts: "リフト",
  courses: "コース",
  detail: "調査・詳細",
  article: "記事",
  full: "全体説明",
  research: "調査情報",
  date: "日付",
  note: "備考",
  good: "良い点",
  bad: "注意点",
  description: "説明",
  sources: "出典",
  url: "URL",
  quote: "引用",
  warn: "要確認",
  warnReason: "確認理由",
  score: "評価",
  reason: "理由",
  links: "リンク",
  linkRequests: "関連リンク",
  rows: "対応表",
  mapping: "営業情報の対応表",
  orderedGeojsonNames: "コースの表示順",
  beginner: "初心者",
  intermediate: "中級者",
  advanced: "上級者",
  speed: "速度",
  capacity: "定員",
  distance: "距離",
  vertical: "標高差",
  top: "山頂標高",
  bottom: "山麓標高",
  hood: "フード",
  footrest: "フットレスト",
  morning: "早朝",
  night: "ナイター",
  type: "種類",
  platform: "リンクの種類",
  offers: "券種",
  season: "シーズン",
  label_ja: "表示名",
  amount: "金額",
  price: "料金",
  preservedFeatures: "保持するコース",
  preservedDetails: "保持する詳細",
};
export const fieldLabel = (key: string) => LABELS[key] ?? key;
const HIDDEN = new Set([
  "fileHash",
  "detailFileHash",
  "mappingFileHash",
  "expectedUpdatedAt",
  "expectedHashes",
  "baseVersion",
  "expectedLinks",
]);
const READ_ONLY = new Set([
  "id",
  "@id",
  "entityId",
  "geometryId",
  "resortId",
  "targetSkiId",
  "sourceKind",
  "kind",
  "latestFile",
  "platform",
]);
const NUMERIC_NULLS = new Set([
  "steepestSlope",
  "typeNotPressed",
  "typePressed",
  "typeBump",
  "angleMax",
  "angleAvg",
  "liftCapacity",
  "skiersPercent",
  "snowboardersPercent",
  "review",
  "score",
  "speed",
  "capacity",
  "distance",
  "vertical",
  "top",
  "bottom",
  "amount",
  "price",
]);

export function ValueFields({
  value,
  onChange,
  label = "内容",
  field = "",
  disabled = false,
}: {
  value: unknown;
  onChange?: (value: unknown) => void;
  label?: string;
  field?: string;
  disabled?: boolean;
}) {
  const [limit, setLimit] = useState(30);
  if (HIDDEN.has(field)) return null;
  const readonly = disabled || !onChange || READ_ONLY.has(field);
  if (Array.isArray(value))
    return (
      <details className="rounded border p-3" open={value.length < 4}>
        <summary>
          {label}（{value.length}件）
        </summary>
        <div className="mt-2 space-y-2">
          {value.slice(0, limit).map((item, index) => (
            <ValueFields
              // biome-ignore lint/suspicious/noArrayIndexKey: This editor preserves order and does not insert or remove rows.
              key={index}
              value={item}
              label={`${index + 1}`}
              disabled={readonly}
              onChange={next =>
                onChange?.(
                  value.map((entry, i) => (i === index ? next : entry)),
                )
              }
            />
          ))}
          {value.length > limit && (
            <button
              type="button"
              className="underline text-sm"
              onClick={() => setLimit(current => current + 50)}
            >
              続きを表示
            </button>
          )}
        </div>
      </details>
    );
  if (value && typeof value === "object")
    return (
      <fieldset className="min-w-0 rounded border p-3 space-y-3">
        <legend className="px-1 font-semibold">{label}</legend>
        {Object.entries(value).map(([key, item]) => (
          <ValueFields
            key={key}
            field={key}
            label={fieldLabel(key)}
            value={item}
            disabled={readonly}
            onChange={next => onChange?.({ ...value, [key]: next })}
          />
        ))}
      </fieldset>
    );
  if (typeof value === "boolean")
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value}
          disabled={readonly}
          onChange={event => onChange?.(event.target.checked)}
        />
        {label}
      </label>
    );
  if (readonly)
    return (
      <div className="text-sm whitespace-pre-wrap break-words">
        <span className="text-gray-600">{label}: </span>
        {value === null ? "未設定" : String(value ?? "")}
      </div>
    );
  const numeric = typeof value === "number" || NUMERIC_NULLS.has(field);
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {numeric ? (
        <input
          className="w-full rounded border p-2"
          type="number"
          step="any"
          value={typeof value === "number" ? value : ""}
          onChange={event =>
            onChange?.(
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      ) : (
        <textarea
          className="w-full rounded border p-2"
          rows={
            typeof value === "string" &&
            (value.length > 100 || value.includes("\n"))
              ? 4
              : 1
          }
          value={value == null ? "" : String(value)}
          onChange={event =>
            onChange?.(
              value === null && !event.target.value ? null : event.target.value,
            )
          }
        />
      )}
    </label>
  );
}
