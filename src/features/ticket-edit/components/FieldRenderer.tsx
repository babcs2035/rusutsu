"use client";

import { Box, Button, Flex, Input, Text, Textarea } from "@chakra-ui/react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";
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

const selectStyle: React.CSSProperties = {
  height: 36,
  width: "100%",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "white",
  fontSize: 14,
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
  <Box>
    <Flex mb={1} alignItems="baseline" gap={1.5} flexWrap="wrap">
      <Text
        color="gray.700"
        fontSize="xs"
        fontWeight="800"
        title={description ?? undefined}
      >
        {labelOf(fieldKey)}
      </Text>
      <Text color="gray.400" fontSize="0.62rem" fontFamily="mono">
        {fieldKey}
      </Text>
      {required && (
        <Text color="red.600" fontSize="0.62rem" fontWeight="900">
          必須
        </Text>
      )}
    </Flex>
    {children}
    {error && (
      <Text mt={1} color="red.600" fontSize="0.68rem" fontWeight="700">
        {error}
      </Text>
    )}
  </Box>
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
        <select
          style={{
            ...selectStyle,
            borderColor: dangling ? "#dc2626" : "#d1d5db",
          }}
          value={current}
          onChange={event => commit(event.target.value)}
        >
          <option value="">未設定</option>
          {dangling && (
            <option value={current}>{current}（存在しません）</option>
          )}
          {options.map(option => (
            <option key={option.id} value={option.id}>
              {option.label === ""
                ? option.id
                : `${option.label}（${option.id}）`}
            </option>
          ))}
        </select>
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
        <select
          style={selectStyle}
          value={current}
          onChange={event => commit(event.target.value)}
        >
          <option value="">未設定（マスタに無い）</option>
          {!known && current !== "" && (
            <option value={current}>{current}（マスタに無い）</option>
          )}
          {resortOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}（{option.id}）
            </option>
          ))}
        </select>
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
        <select
          style={selectStyle}
          value={current}
          onChange={event => commit(event.target.value)}
          title={labels[current]?.definitionJa ?? undefined}
        >
          {(canClear || current === "") && <option value="">未設定</option>}
          {spec.enumValues.map(option => (
            <option
              key={option}
              value={option}
              title={labels[option]?.definitionJa ?? undefined}
            >
              {enumOptionLabel(option, labels)}
            </option>
          ))}
        </select>
        {labels[current]?.definitionJa && (
          <Text mt={1} color="gray.500" fontSize="0.66rem" lineHeight="1.6">
            {labels[current]?.definitionJa}
          </Text>
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
          size="sm"
          minH="80px"
          bg="white"
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
        size="sm"
        bg="white"
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
        size="sm"
        bg="white"
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
      <select
        style={selectStyle}
        value={current}
        onChange={event => {
          const next = event.target.value;
          if (next === "") {
            update(path, required && spec.nullable ? null : REMOVE);
            return;
          }
          update(path, next === "true");
        }}
      >
        <option value="">
          {spec.nullable ? "未設定（記載なし）" : "未設定"}
        </option>
        <option value="true">はい</option>
        <option value="false">いいえ</option>
      </select>
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
      <Flex
        p={2}
        gap={1.5}
        flexWrap="wrap"
        borderRadius="lg"
        border="1px solid"
        borderColor="gray.200"
        bg="white"
        maxH="220px"
        overflowY="auto"
      >
        {options.length === 0 ? (
          <Text color="gray.400" fontSize="xs">
            選択できる項目がありません。
          </Text>
        ) : (
          options.map(option => {
            const checked = values.includes(option.id);
            return (
              <Flex
                as="label"
                key={option.id}
                px={2}
                py={1}
                alignItems="center"
                gap={1.5}
                borderRadius="md"
                border="1px solid"
                borderColor={checked ? "blue.400" : "gray.200"}
                bg={checked ? "blue.50" : "white"}
                cursor="pointer"
                title={option.help ?? undefined}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option.id)}
                />
                <Text fontSize="xs" fontWeight={checked ? "800" : "600"}>
                  {option.label}
                </Text>
              </Flex>
            );
          })
        )}
      </Flex>
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
      <Flex flexDirection="column" gap={1.5}>
        {values.map((value, index) => (
          <Flex
            // biome-ignore lint/suspicious/noArrayIndexKey: 値の並び順自体が意味を持つ配列で、IDを持たない。
            key={index}
            gap={1.5}
            alignItems="center"
          >
            {items.kind === "number" ? (
              <Input
                size="sm"
                bg="white"
                type="number"
                value={typeof value === "number" ? String(value) : ""}
                onChange={event =>
                  update([...path, index], Number(event.target.value))
                }
              />
            ) : (
              <Input
                size="sm"
                bg="white"
                type={isDate ? "date" : "text"}
                value={typeof value === "string" ? value : ""}
                onChange={event => update([...path, index], event.target.value)}
              />
            )}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              colorPalette="red"
              aria-label="削除"
              onClick={() => update([...path, index], REMOVE)}
            >
              <Trash2 size={14} />
            </Button>
          </Flex>
        ))}
        <Button
          type="button"
          size="xs"
          variant="outline"
          alignSelf="start"
          onClick={() =>
            update(path, [...values, createDefaultValue(items) ?? ""])
          }
        >
          <Plus size={13} />
          追加
        </Button>
      </Flex>
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
    <Box>
      <Flex mb={2} alignItems="center" justifyContent="space-between" gap={2}>
        <Flex alignItems="baseline" gap={1.5} flexWrap="wrap">
          <Text color="gray.700" fontSize="xs" fontWeight="800">
            {labelOf(fieldKey)}
          </Text>
          <Text color="gray.400" fontSize="0.62rem" fontFamily="mono">
            {fieldKey}
          </Text>
          {required && (
            <Text color="red.600" fontSize="0.62rem" fontWeight="900">
              必須
            </Text>
          )}
          <Text color="gray.500" fontSize="0.62rem">
            {values.length}件
          </Text>
        </Flex>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => update(path, [...values, createDefaultValue(items)])}
        >
          <Plus size={13} />
          追加
        </Button>
      </Flex>
      {description && (
        <Text mb={2} color="gray.500" fontSize="0.68rem" lineHeight="1.6">
          {description}
        </Text>
      )}
      {spec.minItems > 0 && values.length < spec.minItems && (
        <Text mb={2} color="red.600" fontSize="0.68rem" fontWeight="700">
          {spec.minItems}件以上必要です。
        </Text>
      )}
      <Flex flexDirection="column" gap={2}>
        {values.map((value, index) => (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が意味を持ち、要素にIDが無い配列がある。
            key={index}
            p={3}
            borderRadius="lg"
            border="1px solid"
            borderColor="gray.200"
            bg="gray.50"
          >
            <Flex mb={2} alignItems="center" justifyContent="space-between">
              <Text color="gray.600" fontSize="xs" fontWeight="800">
                {itemTitle(value, index)}
              </Text>
              <Flex gap={1}>
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
                  colorPalette="red"
                  aria-label="削除"
                  onClick={() => update([...path, index], REMOVE)}
                >
                  <Trash2 size={14} />
                </Button>
              </Flex>
            </Flex>
            <ObjectFields
              path={[...path, index]}
              spec={items as Extract<FieldSpec, { kind: "object" }>}
              value={value}
              depth={depth + 1}
            />
          </Box>
        ))}
      </Flex>
    </Box>
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
    <Box
      p={3}
      borderRadius="lg"
      border="1px solid"
      borderColor="gray.200"
      bg="white"
    >
      <Flex alignItems="center" justifyContent="space-between" gap={2}>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          px={1}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Text color="gray.700" fontSize="xs" fontWeight="800">
            {labelOf(fieldKey)}
          </Text>
          <Text color="gray.400" fontSize="0.62rem" fontFamily="mono">
            {fieldKey}
          </Text>
          {required && (
            <Text color="red.600" fontSize="0.62rem" fontWeight="900">
              必須
            </Text>
          )}
        </Button>
        {(spec.nullable || !required) &&
          (present ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={() =>
                update(path, required && spec.nullable ? null : REMOVE)
              }
            >
              未設定にする
            </Button>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => update(path, createDefaultValue(spec))}
            >
              <Plus size={13} />
              設定する
            </Button>
          ))}
      </Flex>
      {description && open && (
        <Text mt={2} color="gray.500" fontSize="0.68rem" lineHeight="1.6">
          {description}
        </Text>
      )}
      {open &&
        (present ? (
          <Box mt={3}>
            <ObjectFields
              path={path}
              spec={spec}
              value={value}
              depth={depth + 1}
            />
          </Box>
        ) : (
          <Text mt={2} color="gray.400" fontSize="xs">
            未設定（資料に記載がない場合はこのまま）
          </Text>
        ))}
    </Box>
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
          <Box
            p={2}
            borderRadius="md"
            bg="gray.100"
            fontSize="xs"
            fontFamily="mono"
            whiteSpace="pre-wrap"
          >
            {JSON.stringify(value, null, 2)}
          </Box>
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
    <Flex flexDirection="column" gap={4}>
      {groups.map(group => (
        <Box
          key={`${group.wide}-${group.fields[0].key}`}
          display="grid"
          gridTemplateColumns={
            group.wide
              ? "1fr"
              : { base: "1fr", md: "repeat(2, minmax(0, 1fr))" }
          }
          gap={group.wide ? 3 : 4}
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
        </Box>
      ))}
    </Flex>
  );
};
