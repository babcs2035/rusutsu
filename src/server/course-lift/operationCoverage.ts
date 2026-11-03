import {
  createOperationStatusResolver,
  type OperationResolutionReason,
  operationStatusSymbol,
} from "@/lib/operationStatusResolver";

export type OperationListingPolicy = {
  listingMode?: "complete" | "operating-only";
  listingState?: "listed" | "not-published" | "failed";
};

export function evaluateOperationCoverage(
  rows: Array<{
    id: string;
    crawledNames: string[];
    mappingAssigned?: boolean;
  }>,
  items: unknown,
  policy: OperationListingPolicy = {},
) {
  const resolve = createOperationStatusResolver(items);
  const resolved = rows.map(row => ({
    ...row,
    resolution: resolve(row.crawledNames),
  }));
  const hasListedOperation =
    Array.isArray(items) &&
    items.some(
      item =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof item.name === "string" &&
        item.name.trim() &&
        operationStatusSymbol(item.status) !== null,
    );
  const missingIsExpected =
    policy.listingMode === "operating-only" &&
    (policy.listingState === "not-published" ||
      (policy.listingState !== "failed" && hasListedOperation));
  const gaps = new Map<
    string,
    {
      reason: OperationResolutionReason;
      references: string[];
      entityIds: string[];
    }
  >();
  for (const row of resolved) {
    const { reason, references } = row.resolution;
    if (reason === "matched" || reason === "unmapped") continue;
    if (reason === "missing" && missingIsExpected) continue;
    const key = JSON.stringify([reason, references]);
    const gap = gaps.get(key) ?? { reason, references, entityIds: [] };
    gap.entityIds.push(row.id);
    gaps.set(key, gap);
  }
  return {
    resolved,
    gaps: [...gaps.values()],
    // 未設定と意図的な対応なしは取得障害に数えない。
    unassigned: rows.filter(
      row => !row.crawledNames.length && !row.mappingAssigned,
    ).length,
    excluded: rows.filter(
      row => !row.crawledNames.length && row.mappingAssigned,
    ).length,
  };
}
