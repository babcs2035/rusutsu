import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EnumLabelCatalog,
  FieldEntry,
  FieldSpec,
  StringFormat,
  TicketSchemaSpec,
} from "../types";

/**
 * リフト券料金JSONの構造は Skill 側の JSON Schema が正本。
 * 画面のフォームはここで schema を読んで組み立てるので、
 * schema が更新されればフォームも自動的に追従する
 * （画面側にフィールド定義をコピーすると必ず食い違う）。
 */
const SKILL_ROOT = path.join(
  process.cwd(),
  ".shared",
  "skills",
  "collect-ski-lift-ticket-pricing",
);

const SCHEMA_PATH = path.join(
  SKILL_ROOT,
  "references",
  "lift-ticket.schema.json",
);

const TAXONOMY_PATH = path.join(SKILL_ROOT, "references", "taxonomy.json");

type RawSchema = Record<string, unknown>;

const asSchema = (value: unknown): RawSchema | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawSchema)
    : null;

const asStringArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === "string")
    ? value
    : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** `#/$defs/offer` のような参照を解決する（このschemaに循環参照はない） */
const dereference = (schema: RawSchema, root: RawSchema): RawSchema => {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return schema;

  let node: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    node = asSchema(node)?.[segment];
  }
  const target = asSchema(node);
  if (!target) return schema;

  const { $ref: _ignored, ...siblings } = schema;
  return dereference({ ...target, ...siblings }, root);
};

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";
const ID_PATTERN = "^[a-z0-9][a-z0-9_\\-.]*$";
const VERSION_PATTERN = "^\\d+\\.\\d+\\.\\d+$";

const stringFormatOf = (schema: RawSchema): StringFormat => {
  if (schema.format === "date-time") return "date-time";
  const pattern = typeof schema.pattern === "string" ? schema.pattern : null;
  if (pattern === DATE_PATTERN) return "date";
  if (pattern === TIME_PATTERN) return "time";
  if (pattern === ID_PATTERN) return "id";
  if (pattern === VERSION_PATTERN) return "version";
  return "text";
};

/**
 * `type: ["string", "null"]` / `anyOf: [{...}, {type:"null"}]` /
 * `oneOf: [...]` をまとめて「null許容つきの1つの型」に畳む。
 *
 * `allOf` の if/then（priceのmode別必須など）は**検証専用**なので無視する。
 * 画面はどのフィールドを埋めたかで意味が決まるモデルをそのまま編集させ、
 * 整合性は保存時に検証スクリプトが判定する。
 */
const flatten = (
  input: RawSchema,
  root: RawSchema,
): { schema: RawSchema; nullable: boolean } => {
  const schema = dereference(input, root);
  const branches = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null;

  if (branches) {
    const resolved = branches
      .map(branch => asSchema(branch))
      .filter((branch): branch is RawSchema => branch !== null)
      .map(branch => dereference(branch, root));
    const nonNull = resolved.filter(branch => branch.type !== "null");
    const nullable = resolved.length !== nonNull.length;
    const { anyOf: _a, oneOf: _o, ...rest } = schema;
    if (nonNull.length === 0) return { schema: rest, nullable: true };
    const merged = flatten({ ...nonNull[0], ...rest }, root);
    return { schema: merged.schema, nullable: nullable || merged.nullable };
  }

  const types = asStringArray(schema.type);
  if (types) {
    const nonNull = types.filter(type => type !== "null");
    return {
      schema: { ...schema, type: nonNull[0] },
      nullable: nonNull.length !== types.length,
    };
  }
  return { schema, nullable: false };
};

const toFieldSpec = (input: RawSchema, root: RawSchema): FieldSpec => {
  const { schema, nullable: flattenedNullable } = flatten(input, root);
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  const nullableByEnum = enumValues?.includes(null) ?? false;
  const nullable = flattenedNullable || nullableByEnum;
  const type =
    typeof schema.type === "string"
      ? schema.type
      : enumValues
        ? "string"
        : schema.properties
          ? "object"
          : schema.items
            ? "array"
            : null;

  switch (type) {
    case "string":
      return {
        kind: "string",
        nullable,
        format: stringFormatOf(schema),
        enumValues:
          enumValues
            ?.filter((value): value is string => typeof value === "string")
            .slice() ?? null,
        minLength: asNumber(schema.minLength),
      };
    case "integer":
    case "number":
      return {
        kind: "number",
        nullable,
        integer: type === "integer",
        minimum: asNumber(schema.minimum),
        maximum: asNumber(schema.maximum),
        exclusiveMinimum: asNumber(schema.exclusiveMinimum),
      };
    case "boolean":
      return { kind: "boolean", nullable };
    case "array": {
      const items = asSchema(schema.items);
      return {
        kind: "array",
        nullable,
        items: items
          ? toFieldSpec(items, root)
          : { kind: "unsupported", nullable: false },
        minItems: asNumber(schema.minItems) ?? 0,
      };
    }
    case "object": {
      const properties = asSchema(schema.properties);
      if (!properties) return { kind: "unsupported", nullable };
      const fields: FieldEntry[] = Object.entries(properties).flatMap(
        ([key, value]) => {
          const child = asSchema(value);
          if (!child) return [];
          const described = dereference(child, root);
          return [
            {
              key,
              description:
                typeof described.description === "string"
                  ? described.description
                  : null,
              spec: toFieldSpec(child, root),
            },
          ];
        },
      );
      return {
        kind: "object",
        nullable,
        required: asStringArray(schema.required) ?? [],
        fields,
      };
    }
    default:
      return { kind: "unsupported", nullable };
  }
};

export const readTicketSchemaSpec = async (): Promise<TicketSchemaSpec> => {
  const raw = await fs.readFile(SCHEMA_PATH, "utf8");
  const root = asSchema(JSON.parse(raw));
  if (!root) throw new Error("lift-ticket.schema.json を読み込めません。");
  const spec = toFieldSpec(root, root);
  if (spec.kind !== "object") {
    throw new Error("lift-ticket.schema.json のルートがオブジェクトではない。");
  }
  return spec;
};

/**
 * enum の選択肢に出す日本語名。
 * 標準ラベルの正本は taxonomy.json なので、**画面側で訳語を持たない**。
 * 群ごとに分けて返し、どの群かは enum の値の集合から画面側が特定する
 * （`check-taxonomy-integrity.mjs` が schema の enum と taxonomy の群を
 * 一致させているので、値の集合で一意に決まる）。
 */
export const readEnumLabels = async (): Promise<EnumLabelCatalog> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(TAXONOMY_PATH, "utf8"));
  } catch {
    return { groups: [] };
  }
  const groups = asSchema(asSchema(parsed)?.groups);
  if (!groups) return { groups: [] };

  return {
    groups: Object.entries(groups).flatMap(([groupName, groupValue]) => {
      const labels = asSchema(asSchema(groupValue)?.labels);
      if (!labels) return [];
      return [
        {
          name: groupName,
          labels: Object.fromEntries(
            Object.entries(labels).map(([labelName, labelValue]) => {
              const definition = asSchema(labelValue);
              return [
                labelName,
                {
                  labelJa:
                    typeof definition?.label_ja === "string"
                      ? definition.label_ja
                      : null,
                  definitionJa:
                    typeof definition?.definition_ja === "string"
                      ? definition.definition_ja
                      : null,
                },
              ];
            }),
          ),
        },
      ];
    }),
  };
};

export const SKILL_SCRIPTS_DIR = path.join(SKILL_ROOT, "scripts");
