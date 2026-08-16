import type { FieldSpec } from "../types";

export type NodePath = (string | number)[];

/** 値ではなくキー自体を消すための指示 */
export const REMOVE = Symbol("remove");

export type NodeUpdate = unknown | typeof REMOVE;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const getAtPath = (root: unknown, path: NodePath): unknown => {
  let current: unknown = root;
  for (const segment of path) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      current = current[String(segment)];
    } else {
      return undefined;
    }
  }
  return current;
};

/**
 * ★キー順序を保ったまま1箇所だけ差し替える。
 *
 * オブジェクトは spread で複製するので、**既にあるキーは元の位置のまま**に
 * なる（新しいキーだけが末尾に付く）。これにより「読み込んで1箇所だけ直して
 * 保存」したときの差分が、実際に直した箇所だけになる。
 */
const replaceChild = (
  node: unknown,
  segment: string | number,
  value: NodeUpdate,
): unknown => {
  if (Array.isArray(node)) {
    const next = [...node];
    if (value === REMOVE) {
      next.splice(Number(segment), 1);
    } else {
      next[Number(segment)] = value;
    }
    return next;
  }
  const base = isRecord(node) ? node : {};
  if (value === REMOVE) {
    const next = { ...base };
    delete next[String(segment)];
    return next;
  }
  return { ...base, [String(segment)]: value };
};

export const setAtPath = <T>(root: T, path: NodePath, value: NodeUpdate): T => {
  if (path.length === 0) {
    return (value === REMOVE ? undefined : value) as T;
  }
  const [head, ...rest] = path;
  const child = getAtPath(root, [head]);
  const nextChild = rest.length === 0 ? value : setAtPath(child, rest, value);
  return replaceChild(root, head, nextChild) as T;
};

export const moveInArray = <T>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * schemaの必須フィールドだけを埋めた新規項目を作る。
 *
 * 任意フィールドは**キーを作らない**（`null` を並べたJSONにしないため）。
 * 必須なのに値を決められないものは、schemaが `null` を許していれば `null`、
 * enumに `unknown` があれば `unknown` にする — どちらも
 * 「資料から確定できていない」を表す正しい値で、推測より安全。
 */
export const createDefaultValue = (spec: FieldSpec): unknown => {
  switch (spec.kind) {
    case "string": {
      if (spec.enumValues && spec.enumValues.length > 0) {
        if (spec.enumValues.includes("unknown")) return "unknown";
        if (spec.nullable) return null;
        return spec.enumValues[0];
      }
      if (spec.nullable && (spec.minLength ?? 0) === 0) return null;
      return spec.nullable ? null : "";
    }
    case "number":
      return spec.nullable ? null : (spec.minimum ?? 0);
    case "boolean":
      return spec.nullable ? null : false;
    case "array": {
      if (spec.minItems > 0 && spec.items.kind !== "unsupported") {
        return Array.from({ length: spec.minItems }, () =>
          createDefaultValue(spec.items),
        );
      }
      return [];
    }
    case "object": {
      // null を許すオブジェクト（sales_period / purchase_deadline 等）は
      // 「資料に記載がない」を表す null が正しい初期値。空オブジェクトを
      // 置くと「期間の指定はあるが中身が空」という別の意味になる
      if (spec.nullable) return null;
      const value: Record<string, unknown> = {};
      for (const field of spec.fields) {
        if (!spec.required.includes(field.key)) continue;
        value[field.key] = createDefaultValue(field.spec);
      }
      return value;
    }
    default:
      return null;
  }
};

/** 空文字を必須文字列に残さないための判定 */
export const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");
