"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAKER_OPTIONS } from "@/features/lift/constants";
import { cn } from "@/lib/utils";
import { chipClass, Field } from "@/shared/components/FormParts";
import {
  type CorrectionFeature,
  type CorrectionKind,
  currentValue,
  editCount,
  editedValue,
  FIELD_LABELS,
  hasSegments,
  isBlankName,
  isEdited,
  isMarkField,
  isNumberField,
  LEVEL_VALUES,
  LIFT_DETAIL_FIELDS,
  LIFT_TYPE_VALUES,
  type PropEdits,
  SLOPE_DETAIL_FIELDS,
  SPEED_VALUES,
  valueText,
} from "../model";

type Option = { value: string | null; label: string; title?: string };

const MARK_OPTIONS: Record<string, Option[]> = {
  piste: [
    { value: "○", label: "圧雪" },
    { value: "△", label: "日による", title: "日によって圧雪" },
    { value: "×", label: "非圧雪" },
    { value: null, label: "不明" },
  ],
  default: [
    { value: "○", label: "あり" },
    { value: "×", label: "なし" },
    { value: null, label: "不明" },
  ],
};
const TEXT_OPTIONS: Record<string, string[]> = {
  level: LEVEL_VALUES,
  type: LIFT_TYPE_VALUES,
  speed: SPEED_VALUES,
};
const optionsOf = (field: string): Option[] | null =>
  isMarkField(field)
    ? (MARK_OPTIONS[field] ?? MARK_OPTIONS.default)
    : TEXT_OPTIONS[field]
      ? [
          ...TEXT_OPTIONS[field].map(value => ({ value, label: value })),
          { value: null, label: "未登録" },
        ]
      : null;

export const MARK_FIELD_OPTIONS = MARK_OPTIONS;

function ChoiceChips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: unknown;
  onChange: (value: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">{label}</legend>
      {options.map(option => (
        <Button
          type="button"
          key={option.value ?? "none"}
          variant="outline"
          aria-pressed={value === option.value}
          title={option.title}
          className={chipClass(value === option.value)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

/** 1本のコース・リフトの項目を直す欄 */
export function FeatureForm({
  feature,
  edits,
  onEdit,
  onReset,
}: {
  feature: CorrectionFeature;
  edits: PropEdits;
  onEdit: (feature: CorrectionFeature, field: string, value: unknown) => void;
  onReset: (feature: CorrectionFeature, field: string) => void;
}) {
  const makerListId = useId();
  const fields =
    feature.kind === "slope" ? SLOPE_DETAIL_FIELDS : LIFT_DETAIL_FIELDS;
  // リフトは「油よけカバー」など項目名が長いので、項目名の列を広げる
  const labelClassName = feature.kind === "lift" ? "w-[6.5rem]" : undefined;
  return (
    <div className="space-y-2.5">
      {fields.map(field => {
        const label = FIELD_LABELS[field] ?? field;
        const value = editedValue(edits, feature, field);
        const edited = isEdited(edits, feature.id, field);
        const options = optionsOf(field);
        const segmented =
          feature.kind === "slope" && hasSegments(feature, field);
        return (
          <Field
            key={field}
            label={label}
            labelClassName={labelClassName}
            note={
              edited && !isBlankName(field, value) ? (
                <span className="font-semibold text-amber-700">修正あり</span>
              ) : null
            }
          >
            {options ? (
              <ChoiceChips
                label={label}
                options={options}
                // 区間ごとに分かれているコースは、選ぶまでどれも選択しない
                value={segmented && !edited ? undefined : value}
                onChange={next => onEdit(feature, field, next)}
              />
            ) : (
              <Input
                aria-label={label}
                className="h-8"
                maxLength={field === "name" ? 300 : 100}
                inputMode={isNumberField(field) ? "numeric" : undefined}
                list={field === "maker" ? makerListId : undefined}
                value={value == null ? "" : String(value)}
                onChange={event => {
                  const text = isNumberField(field)
                    ? event.target.value.replace(/[^\d]/g, "").slice(0, 4)
                    : event.target.value;
                  onEdit(feature, field, text);
                }}
              />
            )}
            {field === "maker" && (
              <datalist id={makerListId}>
                {MAKER_OPTIONS.filter(Boolean).map(maker => (
                  <option key={maker} value={maker} />
                ))}
              </datalist>
            )}
            {segmented && !edited && (
              <p className="mt-1 text-xs text-gray-500">
                区間ごとに登録されています。選ぶとコース全体がその値になります。
              </p>
            )}
            {edited && (
              <p className="mt-1 text-xs text-gray-500">
                {isBlankName(field, value) && "空のままでは送信されません。"}
                現在の登録:{" "}
                {segmented
                  ? "区間別"
                  : valueText(field, currentValue(feature, field))}
                <button
                  type="button"
                  className="ml-1.5 text-blue-700 underline underline-offset-2"
                  onClick={() => onReset(feature, field)}
                >
                  戻す
                </button>
              </p>
            )}
          </Field>
        );
      })}
    </div>
  );
}

const KIND_LABEL = { slope: "コース", lift: "リフト" } as const;

/** コース・リフトを一覧から選び、その場で開いて項目を直す */
export function DetailsScreen({
  kind,
  features,
  edits,
  onEdit,
  onReset,
  openId,
  onOpenChange,
  onAddPosition,
}: {
  kind: CorrectionKind;
  features: CorrectionFeature[];
  edits: PropEdits;
  onEdit: (feature: CorrectionFeature, field: string, value: unknown) => void;
  onReset: (feature: CorrectionFeature, field: string) => void;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onAddPosition: () => void;
}) {
  const list = features.filter(feature => feature.kind === kind);
  const openRow = useRef<HTMLDivElement | null>(null);
  // 地図で選んだときも、開いた行が見える位置までスクロールする
  // biome-ignore lint/correctness/useExhaustiveDependencies: 開く行が変わったときだけ動かす
  useEffect(() => {
    openRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openId]);

  if (list.length === 0)
    return (
      <div className="space-y-3 p-3 md:p-4">
        <p className="text-sm text-gray-600">
          {KIND_LABEL[kind]}がまだ登録されていません。先に
          {KIND_LABEL[kind]}の位置を追加してください。
        </p>
        <Button variant="outline" className="w-full" onClick={onAddPosition}>
          {KIND_LABEL[kind]}の位置を追加
        </Button>
      </div>
    );

  return (
    <div>
      <p className="px-3 pt-2 pb-1.5 text-xs text-gray-500 md:px-4">
        直したい{KIND_LABEL[kind]}を一覧か地図から選んでください。
      </p>
      <ul className="divide-y divide-gray-100 border-y border-gray-100">
        {list.map(feature => {
          const open = feature.id === openId;
          const count = editCount(edits, feature.id);
          return (
            <li key={feature.id}>
              <div ref={open ? openRow : undefined}>
                <button
                  type="button"
                  aria-expanded={open}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 px-3 py-1.5 text-left text-sm md:px-4",
                    open ? "bg-blue-50" : "hover:bg-gray-50",
                  )}
                  onClick={() => onOpenChange(open ? null : feature.id)}
                >
                  <span className="min-w-0 flex-1 font-semibold break-words text-gray-900">
                    {feature.name}
                  </span>
                  {count > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber-800">
                      修正 {count}
                    </span>
                  )}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-gray-400 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open && (
                  <div className="border-t border-blue-100 bg-white px-3 py-2.5 md:px-4">
                    <FeatureForm
                      feature={feature}
                      edits={edits}
                      onEdit={onEdit}
                      onReset={onReset}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
