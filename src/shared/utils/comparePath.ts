const MAX_COMPARE_IDS = 2000;
const MAX_COMPARE_QUERY_LENGTH = 402_000;
const RESORT_ID_PATTERN = /^[a-z0-9-]{1,200}$/;

/** Parses bounded resort IDs from a share URL and keeps the first occurrence. */
export function parseCompareIds(
  value: string | string[] | null | undefined,
  knownIds?: ReadonlySet<string>,
): string[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  if (
    values.reduce((length, item) => length + item.length + 1, 0) >
    MAX_COMPARE_QUERY_LENGTH
  )
    return [];

  const unique = new Set<string>();
  for (const id of values.join(",").split(",").slice(0, MAX_COMPARE_IDS)) {
    if (RESORT_ID_PATTERN.test(id) && (!knownIds || knownIds.has(id)))
      unique.add(id);
  }
  return [...unique];
}

export function writeCompareIds(url: URL, ids: readonly string[]) {
  url.searchParams.delete("compare");
  const unique = [...new Set(ids)].slice(0, MAX_COMPARE_IDS);
  const value = unique.join(",");
  if (value.length <= MAX_COMPARE_QUERY_LENGTH && unique.length > 0) {
    url.searchParams.set("compare", value);
  }
  return url;
}
