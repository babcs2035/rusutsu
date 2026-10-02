export type ChangeRow = { path: string; before: string; after: string };
const display = (value: unknown) =>
  value === undefined
    ? "未登録"
    : value === null
      ? "未設定"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
export function changeRows(
  before: unknown,
  after: unknown,
  maxRows = 300,
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const visit = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b) || rows.length >= maxRows)
      return;
    if ((a && typeof a === "object") || (b && typeof b === "object")) {
      const left = (a && typeof a === "object" ? a : {}) as Record<
          string,
          unknown
        >,
        right = (b && typeof b === "object" ? b : {}) as Record<
          string,
          unknown
        >;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        visit(left[key], right[key], path ? `${path}.${key}` : key);
    } else rows.push({ path, before: display(a), after: display(b) });
  };
  visit(before, after, "");
  return rows;
}
