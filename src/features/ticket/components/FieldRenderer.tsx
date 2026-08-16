"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ID_REF_TARGETS,
  ITEM_TITLE_KEYS,
  labelOf,
  MULTILINE_KEYS,
} from "../presentation";
import type { EnumLabelCatalog, EnumLabelInfo, FieldSpec } from "../types";
import {
  createDefaultValue,
  moveInArray,
  type NodePath,
  type NodeUpdate,
  REMOVE,
} from "../utils/nodeOps";
import type { IdIndex } from "../utils/references";

type EditorContextValue = {
  idIndex: IdIndex;
  enumLabels: EnumLabelCatalog;
  /** shared_with_resorts の resort_id は SkiResort マスタから選ばせる */
  resortOptions: { id: string; name: string }[];
  update: (path: NodePath, value: NodeUpdate) => void;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider = EditorContext.Provider;

const useEditor = (): EditorContextValue => {
  const value = useContext(EditorContext);
  if (!value) throw new Error("EditorProvider の外側では使用できません。");
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** 値を消したときに `null` を残すか、キー自体を消すか */
const clearedValue = (required: boolean, nullable: boolean): NodeUpdate =>
  required && nullable ? null : required ? "" : REMOVE;

const FieldShell = ({
  fieldKey,
  required,
  description,
  error,
  children,
}: {
  fieldKey: string;
  required: boolean;
  description: string | null;
  error?: string | null;
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex flex-wrap items-baseline gap-1.5 mb-1">
      <span
        className="text-xs text-gray-700 font-medium"
        title={description ?? undefined}
      >
        {labelOf(fieldKey)}
      </span>
      <span className="text-[0.6875rem] font-mono text-gray-400">
        {fieldKey}
      </span>
      {required && (
        <span className="text-[0.6875rem] font-bold text-red-700">必須</span>
      )}
    </div>
    {children}
    {error && (
      <p className="mt-1 text-[0.6875rem] font-bold text-red-700">{error}</p>
    )}
  </div>
);

type EnumLabels = Record<string, EnumLabelInfo>;

/**
 * enum の値の集合から taxonomy の群を特定する。
 * ★群を特定せずにラベル名だけで引いてはいけない。`unknown` のように
 * 同じ名前が複数の群にあり意味が違うため、別の群の説明を出してしまう。
 */
const resolveEnumLabels = (
  catalog: EnumLabelCatalog,
  enumValues: string[],
): EnumLabels => {
  let best: { score: number; labels: EnumLabels } | null = null;
  for (const group of catalog.groups) {
    const names = Object.keys(group.labels);
    const covered = enumValues.filter(value => names.includes(value)).length;
    if (covered === 0) continue;
    // enumの値を多く網羅し、かつ余分なラベルが少ない群を選ぶ
    const score = covered * 100 - Math.abs(names.length - enumValues.length);
    if (best === null || score > best.score) {
      best = { score, labels: group.labels };
    }
  }
  return best?.labels ?? {};
};

const enumOptionLabel = (value: string, labels: EnumLabels): string => {
  const info = labels[value];
  return info?.labelJa ? `${info.labelJa}（${value}）` : value;
};

const StringField = ({
  path,
  fieldKey,
  spec,
  value,
  required,
  description,
}: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "string" }>;
  value: unknown;
  required: boolean;
  description: string | null;
}) => {
  const { update, enumLabels, idIndex, resortOptions } = useEditor();
  const current = typeof value === "string" ? value : "";
  const missing =
    required && (spec.minLength ?? 0) > 0 && current.trim() === "";
  const error = missing ? "必須項目です。" : null;

  const commit = (next: string) => {
    if (next === "") {
      update(path, clearedValue(required, spec.nullable));
      return;
    }
    update(path, next);
  };

  const refTarget = ID_REF_TARGETS[fieldKey];
  if (refTarget !== undefined) {
    const options = idIndex[refTarget] ?? [];
    const dangling = current !== "" && !options.some(o => o.id === current);
    return (
      <FieldShell
        fieldKey={fieldKey}
        required={required}
        description={description}
        error={dangling ? `${current} は存在しないIDです。` : error}
      >
        <Select value={current} onValueChange={v => v && commit(v)}>
          <SelectTrigger
            className={`h-9 w-full rounded-lg bg-white px-2.5 py-0 text-sm border ${dangling ? "border-red-600" : "border-gray-300"}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">未設定</SelectItem>
            {dangling && (
              <SelectItem value={current}>{current}（存在しません）</SelectItem>
            )}
            {options.map(option => (
              <SelectItem key={option.id} value={option.id}>
                {option.label === ""
                  ? option.id
                  : `${option.label}（${option.id}）`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }

  if (fieldKey === "resort_id" && resortOptions.length > 0) {
    const known = resortOptions.some(option => option.id === current);
    return (
      <FieldShell
        fieldKey={fieldKey}
        required={required}
        description={description}
      >
        <Select value={current} onValueChange={v => v && commit(v)}>
          <SelectTrigger className="h-9 w-full rounded-lg bg-white px-2.5 py-0 text-sm border border-gray-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">未設定（マスタに無い）</SelectItem>
            {!known && current !== "" && (
              <SelectItem value={current}>{current}（マスタに無い）</SelectItem>
            )}
            {resortOptions.map(option => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}（{option.id}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }

  if (spec.enumValues && spec.enumValues.length > 0) {
    const canClear = spec.nullable || !required;
    const labels = resolveEnumLabels(enumLabels, spec.enumValues);
    return (
      <FieldShell
        fieldKey={fieldKey}
        required={required}
        description={description}
      >
        <Select value={current} onValueChange={v => v && commit(v)}>
          <SelectTrigger className="h-9 w-full rounded-lg bg-white px-2.5 py-0 text-sm border border-gray-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(canClear || current === "") && (
              <SelectItem value="__empty__">未設定</SelectItem>
            )}
            {spec.enumValues.map(option => (
              <SelectItem key={option} value={option}>
                {enumOptionLabel(option, labels)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {labels[current]?.definitionJa && (
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-gray-500">
            {labels[current]?.definitionJa}
          </p>
        )}
      </FieldShell>
    );
  }

  if (MULTILINE_KEYS.has(fieldKey)) {
    return (
      <FieldShell
        fieldKey={fieldKey}
        required={required}
        description={description}
        error={error}
      >
        <Textarea
          className="h-20 w-full rounded-md bg-white px-3 py-1 text-sm border border-gray-300 shadow-sm"
          value={current}
          placeholder={description ? "" : "未設定"}
          onChange={event => commit(event.target.value)}
        />
      </FieldShell>
    );
  }

  const inputType =
    spec.format === "date"
      ? "date"
      : spec.format === "time"
        ? "time"
        : spec.format === "date-time"
          ? "datetime-local"
          : "text";

  // date-time は ISO 文字列（末尾Z）で保存されているので、
  // datetime-local の値へ落とすと秒・タイムゾーンが失われる。
  // 情報を捨てないため date-time はテキスト入力のまま扱う。
  const type = spec.format === "date-time" ? "text" : inputType;

  return (
    <FieldShell
      fieldKey={fieldKey}
      required={required}
      description={description}
      error={error}
    >
      <Input
        className="h-9 w-full rounded-md bg-white px-3 py-1 text-sm border border-gray-300 shadow-sm"
        type={type}
        value={current}
        placeholder={
          spec.format === "date-time"
            ? "2026-01-01T00:00:00Z"
            : spec.format === "id"
              ? "英小文字・数字・- _ ."
              : ""
        }
        onChange={event => commit(event.target.value)}
      />
    </FieldShell>
  );
};

const NumberField = ({
  path,
  fieldKey,
  spec,
  value,
  required,
  description,
}: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "number" }>;
  value: unknown;
  required: boolean;
  description: string | null;
}) => {
  const { update } = useEditor();
  const current = typeof value === "number" ? String(value) : "";
  return (
    <FieldShell
      fieldKey={fieldKey}
      required={required}
      description={description}
      error={
        required && current === "" && !spec.nullable ? "必須項目です。" : null
      }
    >
      <Input
        className="h-9 w-full rounded-md bg-white px-3 py-1 text-sm border border-gray-300 shadow-sm"
        type="number"
        step={spec.integer ? 1 : "any"}
        min={spec.minimum ?? undefined}
        max={spec.maximum ?? undefined}
        value={current}
        onChange={event => {
          const raw = event.target.value;
          if (raw === "") {
            update(path, required && spec.nullable ? null : REMOVE);
            return;
          }
          const parsed = spec.integer ? Number.parseInt(raw, 10) : Number(raw);
          if (Number.isNaN(parsed)) return;
          update(path, parsed);
        }}
      />
    </FieldShell>
  );
};

const BooleanField = ({
  path,
  fieldKey,
  spec,
  value,
  required,
  description,
}: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "boolean" }>;
  value: unknown;
  required: boolean;
  description: string | null;
}) => {
  const { update } = useEditor();
  const current = value === true ? "true" : value === false ? "false" : "";
  return (
    <FieldShell
      fieldKey={fieldKey}
      required={required}
      description={description}
    >
      <Select
        value={current}
        onValueChange={next => {
          if (next === "" || next === "__empty__") {
            update(path, required && spec.nullable ? null : REMOVE);
            return;
          }
          update(path, next === "true");
        }}
      >
        <SelectTrigger className="h-9 w-full rounded-lg bg-white px-2.5 py-0 text-sm border border-gray-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__">
            {spec.nullable ? "未設定（記載なし）" : "未設定"}
          </SelectItem>
          <SelectItem value="true">はい</SelectItem>
          <SelectItem value="false">いいえ</SelectItem>
        </SelectContent>
      </Select>
    </FieldShell>
  );
};

const EnumChecklist = ({
  path,
  fieldKey,
  options,
  values,
  required,
  description,
  minItems,
}: {
  path: NodePath;
  fieldKey: string;
  options: { id: string; label: string; help?: string | null }[];
  values: string[];
  required: boolean;
  description: string | null;
  minItems: number;
}) => {
  const { update } = useEditor();
  const toggle = (id: string) => {
    const next = values.includes(id)
      ? values.filter(value => value !== id)
      : [...values, id];
    update(path, next);
  };
  return (
    <FieldShell
      fieldKey={fieldKey}
      required={required}
      description={description}
      error={
        minItems > 0 && values.length < minItems
          ? `${minItems}件以上選択してください。`
          : null
      }
    >
      <Card className="flex flex-wrap rounded-lg border-gray-200 p-2 gap-6 max-h-[220px] overflow-y-auto">
        <CardContent className="p-0">
          {options.length === 0 ? (
            <span className="text-xs text-gray-400">
              選択できる項目がありません。
            </span>
          ) : (
            options.map(option => {
              const checked = values.includes(option.id);
              return (
                <Label
                  key={option.id}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer ${checked ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}
                  title={option.help ?? undefined}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(option.id)}
                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <span
                    className={`text-xs ${checked ? "font-bold" : "font-semibold"}`}
                  >
                    {option.label}
                  </span>
                </Label>
              );
            })
          )}
        </CardContent>
      </Card>
    </FieldShell>
  );
};

const ScalarListField = ({
  path,
  fieldKey,
  spec,
  values,
  required,
  description,
}: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "array" }>;
  values: unknown[];
  required: boolean;
  description: string | null;
}) => {
  const { update } = useEditor();
  const items = spec.items;
  const isDate = items.kind === "string" && items.format === "date";
  return (
    <FieldShell
      fieldKey={fieldKey}
      required={required}
      description={description}
      error={
        spec.minItems > 0 && values.length < spec.minItems
          ? `${spec.minItems}件以上必要です。`
          : null
      }
    >
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 値の並び順自体が意味を持つ配列で、IDを持たない。
            key={index}
            className="flex items-center gap-6"
          >
            {items.kind === "number" ? (
              <Input
                className="h-9 w-full rounded-md bg-white px-3 py-1 text-sm border border-gray-300 shadow-sm"
                type="number"
                value={typeof value === "number" ? String(value) : ""}
                onChange={event =>
                  update([...path, index], Number(event.target.value))
                }
              />
            ) : (
              <Input
                className="h-9 w-full rounded-md bg-white px-3 py-1 text-sm border border-gray-300 shadow-sm"
                type={isDate ? "date" : "text"}
                value={typeof value === "string" ? value : ""}
                onChange={event => update([...path, index], event.target.value)}
              />
            )}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-red-700 hover:text-red-800 hover:bg-red-50"
              aria-label="削除"
              onClick={() => update([...path, index], REMOVE)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="self-start"
          onClick={() =>
            update(path, [...values, createDefaultValue(items) ?? ""])
          }
        >
          <Plus size={13} />
          追加
        </Button>
      </div>
    </FieldShell>
  );
};

const itemTitle = (item: unknown, index: number): string => {
  if (isRecord(item)) {
    for (const key of ITEM_TITLE_KEYS) {
      const value = item[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
  }
  return `${index + 1}件目`;
};

const ObjectListField = ({
  path,
  fieldKey,
  spec,
  values,
  required,
  description,
  depth,
}: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "array" }>;
  values: unknown[];
  required: boolean;
  description: string | null;
  depth: number;
}) => {
  const { update } = useEditor();
  const items = spec.items;
  return (
    <div>
      <div className="flex items-center justify-between gap-8 mb-2">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs text-gray-700 font-medium">
            {labelOf(fieldKey)}
          </span>
          <span className="text-[0.6875rem] font-mono text-gray-400">
            {fieldKey}
          </span>
          {required && (
            <span className="text-[0.6875rem] font-bold text-red-700">
              必須
            </span>
          )}
          <span className="text-[0.6875rem] text-gray-500">
            {values.length}件
          </span>
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => update(path, [...values, createDefaultValue(items)])}
        >
          <Plus size={13} />
          追加
        </Button>
      </div>
      {description && (
        <p className="mb-2 text-[0.6875rem] leading-relaxed text-gray-500">
          {description}
        </p>
      )}
      {spec.minItems > 0 && values.length < spec.minItems && (
        <p className="mb-2 text-[0.6875rem] font-bold text-red-700">
          {spec.minItems}件以上必要です。
        </p>
      )}
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が意味を持ち、要素にIDが無い配列がある。
            key={index}
            className="rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">
                {itemTitle(value, index)}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() =>
                    update(path, moveInArray(values, index, index - 1))
                  }
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={index === values.length - 1}
                  onClick={() =>
                    update(path, moveInArray(values, index, index + 1))
                  }
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-red-700 hover:text-red-800 hover:bg-red-50"
                  aria-label="削除"
                  onClick={() => update([...path, index], REMOVE)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <ObjectFields
              path={[...path, index]}
              spec={items as Extract<FieldSpec, { kind: "object" }>}
              value={value}
              depth={depth + 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const ArrayField = (props: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "array" }>;
  value: unknown;
  required: boolean;
  description: string | null;
  depth: number;
}) => {
  const { enumLabels, idIndex } = useEditor();
  const { fieldKey, spec, value, required, description } = props;
  const values = Array.isArray(value) ? value : [];
  const items = spec.items;

  const refTarget = ID_REF_TARGETS[fieldKey];
  if (refTarget !== undefined && items.kind === "string") {
    const options = idIndex[refTarget] ?? [];
    const selected = values.filter(
      (item): item is string => typeof item === "string",
    );
    const dangling = selected.filter(id => !options.some(o => o.id === id));
    return (
      <EnumChecklist
        path={props.path}
        fieldKey={fieldKey}
        required={required}
        description={description}
        minItems={spec.minItems}
        values={selected}
        options={[
          ...options.map(option => ({
            id: option.id,
            label: option.label === "" ? option.id : option.label,
            help: option.id,
          })),
          ...dangling.map(id => ({
            id,
            label: `${id}（存在しません）`,
            help: "参照先が見つかりません",
          })),
        ]}
      />
    );
  }

  if (items.kind === "string" && items.enumValues) {
    const labels = resolveEnumLabels(enumLabels, items.enumValues);
    return (
      <EnumChecklist
        path={props.path}
        fieldKey={fieldKey}
        required={required}
        description={description}
        minItems={spec.minItems}
        values={values.filter(
          (item): item is string => typeof item === "string",
        )}
        options={items.enumValues.map(option => ({
          id: option,
          label: enumOptionLabel(option, labels),
          help: labels[option]?.definitionJa ?? null,
        }))}
      />
    );
  }

  if (items.kind === "object") {
    return (
      <ObjectListField
        path={props.path}
        fieldKey={fieldKey}
        spec={spec}
        values={values}
        required={required}
        description={description}
        depth={props.depth}
      />
    );
  }

  return (
    <ScalarListField
      path={props.path}
      fieldKey={fieldKey}
      spec={spec}
      values={values}
      required={required}
      description={description}
    />
  );
};

const NestedObjectField = ({
  path,
  fieldKey,
  spec,
  value,
  required,
  description,
  depth,
}: {
  path: NodePath;
  fieldKey: string;
  spec: Extract<FieldSpec, { kind: "object" }>;
  value: unknown;
  required: boolean;
  description: string | null;
  depth: number;
}) => {
  const { update } = useEditor();
  const [open, setOpen] = useState(depth < 1);
  const present = isRecord(value);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="inline-flex items-center px-1 text-xs text-gray-700 font-bold hover:bg-gray-50 hover:text-gray-900 rounded-md justify-start"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs text-gray-700 font-medium">
              {labelOf(fieldKey)}
            </span>
            <span className="text-[0.6875rem] font-mono text-gray-400">
              {fieldKey}
            </span>
            {required && (
              <span className="text-[0.6875rem] font-bold text-red-700">
                必須
              </span>
            )}
          </Button>
          {(spec.nullable || !required) &&
            (present ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-red-700 hover:text-red-800 hover:bg-red-50"
                onClick={event => {
                  event.stopPropagation();
                  update(path, required && spec.nullable ? null : REMOVE);
                }}
              >
                未設定にする
              </Button>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={event => {
                  event.stopPropagation();
                  update(path, createDefaultValue(spec));
                }}
              >
                <Plus size={13} />
                設定する
              </Button>
            ))}
        </div>
        {open && (
          <div className="px-3 md:px-4 pb-4">
            {description && (
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-gray-500">
                {description}
              </p>
            )}
            {present ? (
              <div className="mt-3">
                <ObjectFields
                  path={path}
                  spec={spec}
                  value={value}
                  depth={depth + 1}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-400">
                未設定（資料に記載がない場合はこのまま）
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const FieldRenderer = ({
  path,
  fieldKey,
  spec,
  value,
  required,
  description,
  depth,
}: {
  path: NodePath;
  fieldKey: string;
  spec: FieldSpec;
  value: unknown;
  required: boolean;
  description: string | null;
  depth: number;
}) => {
  switch (spec.kind) {
    case "string":
      return (
        <StringField
          path={path}
          fieldKey={fieldKey}
          spec={spec}
          value={value}
          required={required}
          description={description}
        />
      );
    case "number":
      return (
        <NumberField
          path={path}
          fieldKey={fieldKey}
          spec={spec}
          value={value}
          required={required}
          description={description}
        />
      );
    case "boolean":
      return (
        <BooleanField
          path={path}
          fieldKey={fieldKey}
          spec={spec}
          value={value}
          required={required}
          description={description}
        />
      );
    case "array":
      return (
        <ArrayField
          path={path}
          fieldKey={fieldKey}
          spec={spec}
          value={value}
          required={required}
          description={description}
          depth={depth}
        />
      );
    case "object":
      return (
        <NestedObjectField
          path={path}
          fieldKey={fieldKey}
          spec={spec}
          value={value}
          required={required}
          description={description}
          depth={depth}
        />
      );
    default:
      return (
        <FieldShell
          fieldKey={fieldKey}
          required={required}
          description={description}
          error="この項目はschemaから解釈できないため編集できません（保存時もそのまま保持されます）。"
        >
          <div className="rounded-md bg-gray-100 p-2 text-xs font-mono whitespace-pre-wrap">
            {JSON.stringify(value, null, 2)}
          </div>
        </FieldShell>
      );
  }
};

/** スカラー項目は2列、配列・入れ子オブジェクトは1列で並べる */
export const ObjectFields = ({
  path,
  spec,
  value,
  depth,
  hiddenKeys,
}: {
  path: NodePath;
  spec: Extract<FieldSpec, { kind: "object" }>;
  value: unknown;
  depth: number;
  hiddenKeys?: Set<string>;
}) => {
  const record = isRecord(value) ? value : {};
  const fields = spec.fields.filter(field => !hiddenKeys?.has(field.key));
  const isWide = (fieldSpec: FieldSpec) =>
    fieldSpec.kind === "array" ||
    fieldSpec.kind === "object" ||
    fieldSpec.kind === "unsupported";

  const groups: { wide: boolean; fields: typeof fields }[] = [];
  for (const field of fields) {
    const wide = isWide(field.spec);
    const last = groups.at(-1);
    if (last && last.wide === wide) {
      last.fields.push(field);
    } else {
      groups.push({ wide, fields: [field] });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(group => (
        <div
          key={`${group.wide}-${group.fields[0].key}`}
          className={`grid ${group.wide ? "" : "grid-cols-1 md:grid-cols-2"} ${group.wide ? "gap-3" : "gap-4"}`}
        >
          {group.fields.map(field => (
            <FieldRenderer
              key={field.key}
              path={[...path, field.key]}
              fieldKey={field.key}
              spec={field.spec}
              value={record[field.key]}
              required={spec.required.includes(field.key)}
              description={field.description}
              depth={depth}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
