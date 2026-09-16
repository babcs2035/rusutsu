import type { CrawlMonitorRunSummary } from "@/server/crawl-latest/adminContract";
import { CATEGORY_LABELS, type CategoryKind, formatJst } from "../utils/labels";
import { buildCountSeries } from "../utils/runDiff";

const WIDTH = 240;
const HEIGHT = 48;

/**
 * 件数の推移を小さなSVGで出す。「急に0件になった」をひと目で拾うための線で、
 * 図書館を足さずサーバー描画だけで完結させる。
 */
function Sparkline({
  values,
}: {
  values: ReadonlyArray<{ observedAt: string; itemCount: number }>;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values.map(value => value.itemCount));
  const step = WIDTH / (values.length - 1);
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(
          HEIGHT - (value.itemCount / max) * (HEIGHT - 4) - 2
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-12 w-full"
      role="img"
      aria-label={`最大${max}件、直近${values.length}回の推移`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-gray-700"
      />
    </svg>
  );
}

export function CountTrend({
  runs,
  kinds,
}: {
  runs: readonly CrawlMonitorRunSummary[];
  kinds: readonly CategoryKind[];
}) {
  const series = kinds.map(kind => ({
    kind,
    values: buildCountSeries(runs, kind),
  }));
  if (series.every(entry => entry.values.length < 2)) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {series.map(entry => {
        const latest = entry.values.at(-1);
        return (
          <div
            key={entry.kind}
            className="rounded-lg border border-gray-200 bg-white p-3"
          >
            <p className="mb-1 text-xs text-gray-600">
              {CATEGORY_LABELS[entry.kind]}の件数推移
              {latest
                ? ` / 最新 ${latest.itemCount}件（${formatJst(latest.observedAt)}）`
                : ""}
            </p>
            <Sparkline values={entry.values} />
          </div>
        );
      })}
    </div>
  );
}
