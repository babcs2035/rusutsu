import type { CrawlMonitorMappingGap } from "./adminContract";

/**
 * コース・リフトの対応表（latest_status_mapping）と、クロール結果の突き合わせ。
 *
 * 対応表は「公式サイトに出るはずの名前」の一覧でもあるので、そこにある名前が
 * 取れていなければ、クローラーが拾い漏らしたか、公式の表記が変わった可能性が高い。
 */

/** 対応表の保存先。DataDocumentのキーとしても、ファイルパスとしても使われる。 */
export const LATEST_STATUS_MAPPING_PREFIX =
  "resorts-temporary/latest_status_mapping/";

export const mappingResortIdFromKey = (key: string): string | null =>
  /([^/]+)\.json$/u.exec(key)?.[1] ?? null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalized = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** クロール結果（コース・リフトの配列）から、名前だけを取り出す。 */
export const extractCrawledNames = (data: unknown): string[] => {
  if (!Array.isArray(data)) return [];
  return [
    ...new Set(
      data.flatMap(item => {
        const name = isRecord(item) ? normalized(item.name) : null;
        return name ? [name] : [];
      }),
    ),
  ];
};

/** 対応表のJSONから、kindごとの「取れるはずの名前」を読む。 */
export const parseMappingExpectedNames = (
  content: string | null,
): { COURSES: string[]; LIFTS: string[] } | null => {
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const section = (key: "courses" | "lifts"): string[] => {
    const value = parsed[key];
    if (!isRecord(value) || !Array.isArray(value.rows)) return [];
    return [
      ...new Set(
        value.rows.flatMap(row =>
          isRecord(row) ? (normalized(row.crawledName) ?? []) : [],
        ),
      ),
    ];
  };

  const expected = { COURSES: section("courses"), LIFTS: section("lifts") };
  return expected.COURSES.length + expected.LIFTS.length > 0 ? expected : null;
};

/** 対応表にあるのに取れていない名前と、対応表に無い新しい名前。 */
export const compareWithMapping = (
  kind: CrawlMonitorMappingGap["kind"],
  expected: readonly string[],
  crawled: readonly string[],
): CrawlMonitorMappingGap => {
  const crawledSet = new Set(crawled);
  const expectedSet = new Set(expected);
  return {
    kind,
    expected: expected.length,
    crawled: crawled.length,
    missing: expected.filter(name => !crawledSet.has(name)),
    unexpected: crawled.filter(name => !expectedSet.has(name)),
  };
};

export const buildMappingGaps = (
  expected: { COURSES: string[]; LIFTS: string[] },
  crawledByKind: { COURSES: string[]; LIFTS: string[] },
): CrawlMonitorMappingGap[] =>
  (["COURSES", "LIFTS"] as const)
    .filter(kind => expected[kind].length > 0)
    .map(kind => compareWithMapping(kind, expected[kind], crawledByKind[kind]));
