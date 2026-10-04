"use client";

import { Button } from "@/components/ui/button";
import {
  BINARY_OPTIONS,
  COURSE_DETAIL_LABELS,
  LEVEL_OPTIONS,
  PISTE_OPTIONS,
} from "@/features/slope/constants";
import type { SaveRequest } from "@/features/slope/types";
import type { FeatureReviewItem } from "./featureReview";
import {
  candidateCourseId,
  updateCandidateCourse,
  updateCourseProperty,
} from "./slopeCandidate";

export type SlopeEditorTab = "details" | "geometry" | "mapping";

const DETAIL_KEYS = [
  "level",
  "distance",
  "avg",
  "max",
  "piste",
  "morning",
  "night",
  "note",
  "searchWord",
  "youtubeUrl",
  "image",
] as const;
const WIDE_KEYS = new Set(["note", "searchWord", "youtubeUrl", "image"]);
const NUMERIC_KEYS = new Set(["distance", "avg", "max"]);
const choiceOptions: Partial<
  Record<(typeof DETAIL_KEYS)[number], readonly string[]>
> = {
  level: LEVEL_OPTIONS,
  piste: PISTE_OPTIONS,
  morning: BINARY_OPTIONS,
  night: BINARY_OPTIONS,
};
const markLabel = (key: string, option: string) =>
  key === "piste"
    ? ({ "○": "圧雪", "△": "一部圧雪", "×": "非圧雪" }[option] ?? option)
    : option === "○"
      ? "あり"
      : option === "×"
        ? "なし"
        : option;
const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60";

/** 申請確認画面の中で、選んだコース1本の名前・詳細・位置・対応を直す。 */
export function SlopeRequestEditor({
  candidate,
  item,
  tab,
  onTabChange,
  onChange,
  disabled,
  onResetGeometry,
}: {
  candidate: SaveRequest;
  item: FeatureReviewItem;
  tab: SlopeEditorTab;
  onTabChange: (tab: SlopeEditorTab) => void;
  onChange: (candidate: SaveRequest) => void;
  disabled: boolean;
  onResetGeometry: () => void;
}) {
  const course = candidate.courses.find(
    (course, index) => candidateCourseId(candidate, course, index) === item.id,
  );
  if (!course)
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        このコースは削除されるため、ここでは編集できません。復元する場合は「編集画面で開く」から編集してください。
      </p>
    );
  const updateProperty = (key: string, value: string) =>
    onChange(
      updateCandidateCourse(candidate, item.id, course =>
        updateCourseProperty(course, key, value),
      ),
    );
  const changed = (key: string) =>
    item.fields.find(field => field.key === key)?.changed;
  const mappingRows = candidate.mapping?.rows ?? [];
  const ownCourses = candidate.courses.flatMap((line, index) =>
    line.targetSkiId === candidate.resortId
      ? [{ id: candidateCourseId(candidate, line, index), line }]
      : [],
  );
  const idForMapName = (name: string | null) =>
    ownCourses.find(({ line }) => line.properties.name === name)?.id ?? "";
  return (
    <div className="space-y-4">
      <div
        role="group"
        className="flex gap-1 rounded-lg bg-slate-100 p-1"
        aria-label="編集項目"
      >
        {(
          [
            ["details", "詳細情報"],
            ["geometry", "位置補正"],
            ["mapping", "営業情報との対応"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            disabled={disabled}
            onClick={() => onTabChange(id)}
            className={`min-w-0 flex-1 rounded-md px-2 py-2 text-xs font-medium ${tab === id ? "bg-white text-blue-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "details" && (
        <fieldset disabled={disabled} className="grid grid-cols-2 gap-3">
          <label
            className={`col-span-2 rounded-md text-xs font-medium text-slate-700 ${changed("name") ? "bg-amber-50 p-2 ring-1 ring-amber-200" : ""}`}
          >
            名称
            {changed("name") && (
              <span className="ml-1 text-amber-700">変更あり</span>
            )}
            <input
              className={inputClass}
              value={String(course.properties.name ?? "")}
              onChange={event => updateProperty("name", event.target.value)}
            />
          </label>
          {DETAIL_KEYS.map(key => {
            const value = String(course.properties[key] ?? "");
            const options = choiceOptions[key];
            return (
              <label
                key={key}
                className={`rounded-md text-xs font-medium text-slate-700 ${WIDE_KEYS.has(key) ? "col-span-2" : ""} ${changed(key) ? "bg-amber-50 p-2 ring-1 ring-amber-200" : ""}`}
              >
                {COURSE_DETAIL_LABELS[key]}
                {changed(key) && (
                  <span className="ml-1 text-amber-700">変更あり</span>
                )}
                {options ? (
                  <select
                    className={inputClass}
                    value={value}
                    onChange={event => updateProperty(key, event.target.value)}
                  >
                    <option value="">未設定</option>
                    {options.filter(Boolean).map(option => (
                      <option key={option} value={option}>
                        {markLabel(key, option)}
                      </option>
                    ))}
                    {value && !options.includes(value) && (
                      <option value={value}>{value}</option>
                    )}
                  </select>
                ) : key === "note" ? (
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={value}
                    onChange={event => updateProperty(key, event.target.value)}
                  />
                ) : (
                  <input
                    className={inputClass}
                    type={NUMERIC_KEYS.has(key) ? "number" : "text"}
                    step="any"
                    value={value}
                    onChange={event => updateProperty(key, event.target.value)}
                  />
                )}
              </label>
            );
          })}
        </fieldset>
      )}
      {tab === "geometry" && (
        <div className="space-y-3 text-sm text-slate-700">
          <p className="rounded-lg bg-blue-50 p-3 text-blue-950">
            左の地図で丸い点をドラッグして位置を修正します。線の途中の点をクリックすると頂点を追加できます。頂点の右クリックで削除できます。分割・結合は「編集画面で開く」から行ってください。
          </p>
          <p>頂点: {course.coordinates.length}点</p>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onResetGeometry}
          >
            保存済みの位置に戻す
          </Button>
        </div>
      )}
      {tab === "mapping" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            公式ページのコース名を、正しい地図上のコースに結び付けます。
          </p>
          {mappingRows.map((row, index) => (
            <label
              // biome-ignore lint/suspicious/noArrayIndexKey: Mapping rows cannot be added, removed or reordered in this editor.
              key={`${row.crawledName}-${index}`}
              className="block rounded-lg border border-slate-200 p-3 text-sm"
            >
              <span className="block font-medium text-slate-800">
                {row.crawledNames?.join("、") ||
                  row.crawledName ||
                  "営業ページの名称未設定"}
              </span>
              <select
                className={inputClass}
                disabled={disabled}
                value={row.geometryId ?? idForMapName(row.geojsonName)}
                onChange={event => {
                  const target = ownCourses.find(
                    ({ id }) => id === event.target.value,
                  );
                  if (!candidate.mapping) return;
                  onChange({
                    ...candidate,
                    mapping: {
                      ...candidate.mapping,
                      rows: mappingRows.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              geometryId: target?.id,
                              geojsonName: target
                                ? String(target.line.properties.name ?? "")
                                : null,
                            }
                          : row,
                      ),
                    },
                  });
                }}
              >
                <option value="">対応するコースなし</option>
                {ownCourses.map(({ id, line }) => (
                  <option key={id} value={id}>
                    {String(line.properties.name ?? "名称未設定")}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {!candidate.mapping && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              この申請には営業情報の対応表が含まれていません。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
