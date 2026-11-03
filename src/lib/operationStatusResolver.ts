import { normalizeCrawledName } from "./resortMapMerge";

export type OperationResolutionReason =
  | "matched"
  | "unmapped"
  | "missing"
  | "ambiguous"
  | "status-missing"
  | "status-invalid";

export function operationStatusSymbol(value: unknown): "○" | "△" | "×" | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim();
  if (["○", "〇", "◯"].includes(symbol)) return "○";
  if (symbol === "△") return "△";
  if (["×", "✕", "✖"].includes(symbol)) return "×";
  return null;
}

/** 別名はORで解決し、重複した取得行や複数候補は推測で選ばない。 */
export function createOperationStatusResolver(items: unknown) {
  const byName = new Map<string, Record<string, unknown>[]>();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (typeof item.name !== "string" || !item.name.trim()) continue;
    const key = normalizeCrawledName(item.name);
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  return (names: readonly string[] | undefined) => {
    const references = [
      ...new Set((names ?? []).map(normalizeCrawledName).filter(Boolean)),
    ].sort();
    const matches = [
      ...new Set(references.flatMap(name => byName.get(name) ?? [])),
    ];
    const item = matches.length === 1 ? matches[0] : null;
    const status = operationStatusSymbol(item?.status);
    const reason: OperationResolutionReason = !references.length
      ? "unmapped"
      : !matches.length
        ? "missing"
        : matches.length > 1
          ? "ambiguous"
          : item?.status == null || item.status === ""
            ? "status-missing"
            : status === null
              ? "status-invalid"
              : "matched";
    return { references, item, status, reason };
  };
}
