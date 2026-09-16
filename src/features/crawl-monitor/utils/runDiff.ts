import type {
  CrawlMonitorCategorySummary,
  CrawlMonitorRunSummary,
} from "@/server/crawl-latest/adminContract";
import type { CategoryKind } from "./labels";

/**
 * 隣り合うrunのハッシュだけを見て変化を判定する。
 *
 * 中身のJSONを読み込まずに「更新が止まっている」「コース名の集合が変わった」を出せる。
 */

export type RunChange = "changed" | "names-changed" | "same" | "unknown";

export type RunChangeMap = Record<
  string,
  Partial<Record<CategoryKind, RunChange>>
>;

const compare = (
  current: CrawlMonitorCategorySummary | undefined,
  previous: CrawlMonitorCategorySummary | undefined,
): RunChange => {
  if (!current || !previous) return "unknown";
  if (current.contentHash === null || previous.contentHash === null)
    return "unknown";
  if (current.contentHash !== previous.contentHash) {
    return current.nameSetHash !== previous.nameSetHash
      ? "names-changed"
      : "changed";
  }
  return "same";
};

/** runsは新しい順。各runを1つ前（＝配列の次）のrunと比べる。 */
export const buildRunChangeMap = (
  runs: readonly CrawlMonitorRunSummary[],
): RunChangeMap => {
  const map: RunChangeMap = {};
  runs.forEach((run, index) => {
    const older = runs[index + 1];
    const entry: Partial<Record<CategoryKind, RunChange>> = {};
    for (const category of run.categories) {
      entry[category.kind] = compare(
        category,
        older?.categories.find(other => other.kind === category.kind),
      );
    }
    map[run.id] = entry;
  });
  return map;
};

export const RUN_CHANGE_LABELS: Record<RunChange, string> = {
  changed: "内容が変化",
  "names-changed": "名前の集合が変化",
  same: "前回と同一",
  unknown: "",
};

/** 件数の推移。古い順に並べ替えて返す。 */
export const buildCountSeries = (
  runs: readonly CrawlMonitorRunSummary[],
  kind: CategoryKind,
): Array<{ observedAt: string; itemCount: number; usableItemCount: number }> =>
  [...runs]
    .reverse()
    .map(run => {
      const category = run.categories.find(entry => entry.kind === kind);
      return category
        ? {
            observedAt: run.observedAt,
            itemCount: category.itemCount,
            usableItemCount: category.usableItemCount,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
