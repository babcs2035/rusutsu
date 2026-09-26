import type { LatestStatusMappingRow } from "../types";

export const rowCrawledNames = (row: LatestStatusMappingRow): string[] =>
  [...new Set([row.crawledName, ...(row.crawledNames ?? [])])].filter(
    (name): name is string => typeof name === "string" && name.trim() !== "",
  );

export const withCrawledNames = (
  row: LatestStatusMappingRow,
  names: string[],
): LatestStatusMappingRow => {
  const unique = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  const { crawledNames: _previous, ...rest } = row;
  return {
    ...rest,
    crawledName: unique[0] ?? null,
    ...(unique.length > 1 ? { crawledNames: unique } : {}),
  };
};
