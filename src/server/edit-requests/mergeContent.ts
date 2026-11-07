import { isDeepStrictEqual } from "node:util";

/**
 * 申請時点（before）・今の公開内容（current）・申請内容（candidate）の3つを
 * 項目ごとに比べて重ねる。
 *
 * 片方だけが変えた項目はその変更を採用する。両方が同じ項目を別の値に変えた
 * ときだけ競合として記録し、値は申請内容を採る。競合を採用するかどうかは
 * 呼び出し側（管理者の選択）が決める。
 */
export type MergeResult<T> = { value: T; conflicts: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** コース線・リフト線は properties.entityId、詳細の行は entityId で同じものとみなす。 */
const itemId = (value: unknown): string | null => {
  if (!isObject(value)) return null;
  if (
    value.type === "Feature" &&
    isObject(value.properties) &&
    typeof value.properties.entityId === "string"
  )
    return value.properties.entityId;
  return typeof value.entityId === "string" ? value.entityId : null;
};

const itemLabel = (value: unknown, id: string): string => {
  const source =
    isObject(value) && isObject(value.properties) ? value.properties : value;
  const name = isObject(source) ? source.name : null;
  return typeof name === "string" && name.trim() !== ""
    ? `「${name.trim()}」`
    : `「${id}」`;
};

const join = (path: string, segment: string) =>
  path ? `${path} › ${segment}` : segment;

const hasUniqueIds = (items: unknown[]) => {
  const ids = items.map(itemId);
  return ids.every(id => id !== null) && new Set(ids).size === ids.length;
};

/** 両方にある項目だけを取り出したときの並び */
const sharedOrder = (order: string[], other: Set<string>) =>
  order.filter(id => other.has(id));

function mergeById(
  before: unknown[],
  current: unknown[],
  candidate: unknown[],
  path: string,
  conflicts: string[],
): unknown[] {
  const map = (items: unknown[]) =>
    new Map(items.map(item => [itemId(item) as string, item]));
  const old = map(before);
  const published = map(current);
  const proposed = map(candidate);

  const merged = new Map<string, unknown>();
  for (const id of new Set([
    ...published.keys(),
    ...proposed.keys(),
    ...old.keys(),
  ])) {
    const label = join(
      path,
      itemLabel(proposed.get(id) ?? published.get(id) ?? old.get(id), id),
    );
    const value = mergeValue(
      old.get(id),
      published.get(id),
      proposed.get(id),
      label,
      conflicts,
    );
    if (value !== undefined) merged.set(id, value);
  }

  // 並び順も内容として扱う。片方だけが並べ替えたならその並びを使う。
  const ids = (items: unknown[]) => items.map(item => itemId(item) as string);
  const beforeIds = ids(before);
  const currentIds = ids(current);
  const candidateIds = ids(candidate);
  const kept = new Set(merged.keys());
  const candidateMoved = !isDeepStrictEqual(
    sharedOrder(candidateIds, new Set(beforeIds)),
    sharedOrder(beforeIds, new Set(candidateIds)),
  );
  const currentMoved = !isDeepStrictEqual(
    sharedOrder(currentIds, new Set(beforeIds)),
    sharedOrder(beforeIds, new Set(currentIds)),
  );
  if (
    candidateMoved &&
    currentMoved &&
    !isDeepStrictEqual(
      sharedOrder(currentIds, new Set(candidateIds)),
      sharedOrder(candidateIds, new Set(currentIds)),
    )
  )
    conflicts.push(join(path, "並び順"));
  const primary = candidateMoved || !currentMoved ? candidateIds : currentIds;
  const secondary = primary === candidateIds ? currentIds : candidateIds;
  const order = [...new Set([...primary, ...secondary])].filter(id =>
    kept.has(id),
  );
  return order.map(id => merged.get(id));
}

function mergeValue(
  before: unknown,
  current: unknown,
  candidate: unknown,
  path: string,
  conflicts: string[],
): unknown {
  if (isDeepStrictEqual(before, candidate)) return current;
  if (isDeepStrictEqual(before, current)) return candidate;
  if (isDeepStrictEqual(current, candidate)) return current;

  if (isObject(current) && isObject(candidate)) {
    // 申請後に同時に作られた項目も、中身ごとに比べる
    const base = isObject(before) ? before : before === undefined ? {} : null;
    if (base) {
      const merged: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(current),
        ...Object.keys(candidate),
        ...Object.keys(base),
      ])) {
        const value = mergeValue(
          base[key],
          current[key],
          candidate[key],
          join(path, key),
          conflicts,
        );
        if (value !== undefined) merged[key] = value;
      }
      return merged;
    }
  }
  const baseItems = Array.isArray(before)
    ? before
    : before === undefined
      ? []
      : null;
  if (
    baseItems &&
    Array.isArray(current) &&
    Array.isArray(candidate) &&
    [baseItems, current, candidate].every(hasUniqueIds)
  )
    return mergeById(baseItems, current, candidate, path, conflicts);

  conflicts.push(path || "全体");
  return candidate;
}

/** JSON の値を項目ごとに重ねる。 */
export function mergeValues<T>(
  before: unknown,
  current: unknown,
  candidate: T,
  path = "",
): MergeResult<T> {
  const conflicts: string[] = [];
  const value = mergeValue(before, current, candidate, path, conflicts) as T;
  return { value, conflicts };
}

/** 文書（JSON文字列）を項目ごとに重ねる。JSONでない文書は文書全体で比べる。 */
export function mergeDocumentContent(
  before: string | null,
  current: string | null,
  candidate: string,
  label: string,
): MergeResult<string> {
  if (current === null || current === before)
    return { value: candidate, conflicts: [] };
  if (current === candidate || candidate === before)
    return { value: current, conflicts: [] };
  try {
    const result = mergeValues(
      before === null ? undefined : JSON.parse(before),
      JSON.parse(current),
      JSON.parse(candidate),
      label,
    );
    return {
      value: `${JSON.stringify(result.value, null, 2)}\n`,
      conflicts: result.conflicts,
    };
  } catch {
    return { value: candidate, conflicts: [label] };
  }
}

/** 競合した項目も申請内容で上書きして重ねる（管理者が採用を選んだとき）。 */
export function mergeDocumentChanges(
  before: string | null,
  current: string | null,
  candidate: string,
): string {
  return mergeDocumentContent(before, current, candidate, "").value;
}
