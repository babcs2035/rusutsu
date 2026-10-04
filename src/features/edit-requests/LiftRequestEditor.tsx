"use client";

import { Button } from "@/components/ui/button";
import {
  BUSINESS_HOURS_MARK_OPTIONS,
  DETAIL_KEYS,
  DETAIL_LABELS,
  MAKER_OPTIONS,
  MARK_OPTIONS,
  NUMERIC_DETAIL_KEYS,
  SPEED_OPTIONS,
  TYPE_OPTIONS,
} from "@/features/lift/constants";
import type { SaveRequest } from "@/features/lift/types";
import {
  candidateLiftId,
  updateCandidateLift,
  updateLiftProperty,
} from "./liftCandidate";
import type { LiftReviewItem } from "./liftReview";

export type LiftEditorTab = "details" | "geometry" | "mapping";
const choiceOptions: Record<string, readonly string[]> = {
  type: TYPE_OPTIONS,
  speed: SPEED_OPTIONS,
  hood: MARK_OPTIONS,
  footrest: MARK_OPTIONS,
  oilShield: MARK_OPTIONS,
  morning: BUSINESS_HOURS_MARK_OPTIONS,
  night: BUSINESS_HOURS_MARK_OPTIONS,
};
const aerialwayOptions = {
  chair_lift: "リフト",
  gondola: "ゴンドラ",
  cable_car: "ロープウェイ・ケーブルカー",
  mixed_lift: "コンビリフト",
  drag_lift: "シュレップリフト",
  magic_carpet: "動く歩道",
};
const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60";

export function LiftRequestEditor({
  candidate,
  item,
  tab,
  onTabChange,
  onChange,
  disabled,
  placingMidstation,
  onPlaceMidstation,
  onResetGeometry,
}: {
  candidate: SaveRequest;
  item: LiftReviewItem;
  tab: LiftEditorTab;
  onTabChange: (tab: LiftEditorTab) => void;
  onChange: (candidate: SaveRequest) => void;
  disabled: boolean;
  placingMidstation: boolean;
  onPlaceMidstation: () => void;
  onResetGeometry: () => void;
}) {
  const lift = candidate.lifts.find(
    (lift, index) => candidateLiftId(candidate, lift, index) === item.id,
  );
  if (!lift)
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        このリフトは削除されるため編集できません。
      </p>
    );
  const updateProperty = (key: string, value: string) =>
    onChange(
      updateCandidateLift(candidate, item.id, lift =>
        updateLiftProperty(lift, key, value),
      ),
    );
  const name = String(lift.properties.name ?? "");
  const mappingRows = candidate.mapping?.rows ?? [];
  const idForMapName = (name: string | null) => {
    const index = candidate.lifts.findIndex(
      line =>
        line.targetSkiId === candidate.resortId &&
        line.properties.name === name,
    );
    return index < 0
      ? ""
      : candidateLiftId(candidate, candidate.lifts[index], index);
  };
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
          <label className="col-span-2 text-xs font-medium text-slate-700">
            名称
            <input
              className={inputClass}
              value={name}
              onChange={event => updateProperty("name", event.target.value)}
            />
          </label>
          {DETAIL_KEYS.map(key => {
            const value = String(lift.properties[key] ?? "");
            const options = choiceOptions[key];
            const changed = item.fields.find(
              field => field.key === key,
            )?.changed;
            return (
              <label
                key={key}
                className={`rounded-md text-xs font-medium text-slate-700 ${key === "note" || key === "searchWord" || key === "link" ? "col-span-2" : ""} ${changed ? "bg-amber-50 p-2 ring-1 ring-amber-200" : ""}`}
              >
                {DETAIL_LABELS[key]}
                {changed && (
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
                        {option === "○"
                          ? "あり"
                          : option === "×"
                            ? "なし"
                            : option === "?"
                              ? "不明"
                              : option}
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
                    type={NUMERIC_DETAIL_KEYS.includes(key) ? "number" : "text"}
                    step="any"
                    list={key === "maker" ? "request-lift-makers" : undefined}
                    value={value}
                    onChange={event => updateProperty(key, event.target.value)}
                  />
                )}
              </label>
            );
          })}
          <label className="col-span-2 text-xs font-medium text-slate-700">
            地図上の設備種別
            <select
              className={inputClass}
              value={String(lift.properties.aerialway ?? "")}
              onChange={event =>
                updateProperty("aerialway", event.target.value)
              }
            >
              <option value="">未設定</option>
              {Object.entries(aerialwayOptions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {Boolean(lift.properties.aerialway) &&
                !Object.hasOwn(
                  aerialwayOptions,
                  String(lift.properties.aerialway),
                ) && (
                  <option value={String(lift.properties.aerialway)}>
                    {String(lift.properties.aerialway)}
                  </option>
                )}
            </select>
          </label>
          <datalist id="request-lift-makers">
            {MAKER_OPTIONS.filter(Boolean).map(maker => (
              <option key={maker} value={maker} />
            ))}
          </datalist>
        </fieldset>
      )}
      {tab === "geometry" && (
        <div className="space-y-3 text-sm text-slate-700">
          <p className="rounded-lg bg-blue-50 p-3 text-blue-950">
            左の地図で丸い点をドラッグして位置を修正します。線の途中の点をクリックすると頂点を追加できます。頂点の右クリックで削除できます。
          </p>
          <p>頂点: {lift.coordinates.length}点</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onResetGeometry}
            >
              保存済みの位置に戻す
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onPlaceMidstation}
            >
              {placingMidstation ? "中間駅の配置を終了" : "中間駅を地図で指定"}
            </Button>
            {Array.isArray(lift.properties.midstation) && (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => updateProperty("midstation", "")}
              >
                中間駅を削除
              </Button>
            )}
          </div>
          {placingMidstation && (
            <p className="text-blue-800">
              地図上の中間駅の場所をクリックしてください。
            </p>
          )}
        </div>
      )}
      {tab === "mapping" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            公式ページのリフト名を、正しい地図上のリフトに結び付けます。
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
                  const target = candidate.lifts.find(
                    (line, i) =>
                      candidateLiftId(candidate, line, i) ===
                      event.target.value,
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
                              geometryId: target
                                ? event.target.value
                                : undefined,
                              geojsonName: target
                                ? String(target.properties.name ?? "")
                                : null,
                            }
                          : row,
                      ),
                    },
                  });
                }}
              >
                <option value="">対応するリフトなし</option>
                {candidate.lifts.map(
                  (line, index) =>
                    line.targetSkiId === candidate.resortId && (
                      <option
                        key={candidateLiftId(candidate, line, index)}
                        value={candidateLiftId(candidate, line, index)}
                      >
                        {String(line.properties.name ?? "名称未設定")}
                      </option>
                    ),
                )}
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
