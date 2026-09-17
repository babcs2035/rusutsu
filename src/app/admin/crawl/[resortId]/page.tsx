import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountTrend } from "@/features/crawl-monitor/components/CountTrend";
import { CurrentSnapshots } from "@/features/crawl-monitor/components/CurrentSnapshots";
import { MappingCoverage } from "@/features/crawl-monitor/components/MappingCoverage";
import { Pagination } from "@/features/crawl-monitor/components/Pagination";
import { RunHistoryTable } from "@/features/crawl-monitor/components/RunHistoryTable";
import { SourceModeSelect } from "@/features/crawl-monitor/components/SourceModeSelect";
import {
  buildQueryString,
  ORIGIN_LABELS,
  pageSize,
  parseOrigin,
  parsePage,
  parseSourceModes,
  type RawSearchParams,
} from "@/features/crawl-monitor/utils/query";
import { requireAdmin } from "@/lib/requireAdmin";
import { readSkiResortNames } from "@/lib/skiResortData";
import {
  fetchCrawlMonitorCurrents,
  fetchCrawlMonitorMapping,
  fetchCrawlMonitorRuns,
} from "@/server/crawl-latest/adminClient";
import { crawlMonitorResortIdSchema } from "@/server/crawl-latest/adminContract";
import { withBasePath } from "@/shared/utils/basePath";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "クロール結果 | 管理画面" };

export default async function CrawlMonitorResortPage({
  params,
  searchParams,
}: {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();
  const { resortId: rawResortId } = await params;
  const parsedResortId = crawlMonitorResortIdSchema.safeParse(rawResortId);
  if (!parsedResortId.success) notFound();
  const resortId = parsedResortId.data;

  const query = await searchParams;
  const sourceModes = parseSourceModes(query.sourceModes);
  const requestedOrigin = parseOrigin(query.origin);
  const page = parsePage(query.page);

  // 結果をAPIへ送る運用は段階導入中なので、サーバーのDBとファイルの両方を見る。
  const [names, currents, mapping, databaseRuns, fileRuns] = await Promise.all([
    readSkiResortNames([resortId]),
    fetchCrawlMonitorCurrents(resortId),
    fetchCrawlMonitorMapping(resortId),
    fetchCrawlMonitorRuns({
      resortId,
      origin: "DATABASE",
      sourceModes,
      page: requestedOrigin === "FILE" ? 1 : page,
      pageSize,
    }),
    fetchCrawlMonitorRuns({
      resortId,
      origin: "FILE",
      sourceModes,
      page: requestedOrigin === "FILE" ? page : 1,
      pageSize,
    }),
  ]);
  const resort = names.find(name => name.id === resortId);
  if (!resort) notFound();

  // 接続先が古くファイルの記録を返せないときは、DBの記録だけを見せる。
  const origin = fileRuns.legacyApi
    ? "DATABASE"
    : (requestedOrigin ?? (databaseRuns.total > 0 ? "DATABASE" : "FILE"));
  const shown = origin === "FILE" ? fileRuns : databaseRuns;
  const pageCount = Math.max(1, Math.ceil(shown.total / pageSize));

  return (
    <div className="mx-auto min-h-[calc(100vh-64px)] max-w-[1200px] p-4 md:p-8">
      <nav className="mb-2 text-sm text-gray-600">
        <Link
          href="/admin/crawl"
          className="underline-offset-2 hover:underline"
        >
          クローラー監視
        </Link>
        <span className="mx-1">/</span>
        <span>{resort.nameJa}</span>
      </nav>
      <h1 className="mb-1 font-[var(--font-heading)] text-2xl font-bold text-gray-900 md:text-3xl">
        {resort.nameJa}
      </h1>
      <p className="mb-6 text-sm text-gray-500">{resortId}</p>

      <h2 className="mb-3 text-lg font-bold text-gray-900">
        いま参照されている値
      </h2>
      <CurrentSnapshots currents={currents} />

      <h2 className="mt-8 mb-3 text-lg font-bold text-gray-900">
        対応表との照合
      </h2>
      <MappingCoverage
        gaps={mapping.gaps}
        observedAt={mapping.observedAt}
        legacyApi={mapping.legacyApi}
      />

      <div className="mt-8 mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">実行履歴</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["DATABASE", "FILE"] as const).map(value => {
              if (value === "FILE" && fileRuns.legacyApi) return null;
              const total =
                value === "FILE" ? fileRuns.total : databaseRuns.total;
              return (
                <Link
                  key={value}
                  href={`/admin/crawl/${resortId}${buildQueryString({
                    sourceModes: sourceModes.join(","),
                    origin: value,
                  })}`}
                  className={
                    value === origin
                      ? "rounded-md border border-gray-900 bg-gray-900 px-3 py-1 text-sm text-white"
                      : "rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                  }
                >
                  {ORIGIN_LABELS[value]} {total}件
                </Link>
              );
            })}
          </div>
        </div>
        {origin === "DATABASE" ? (
          <form
            method="get"
            action={withBasePath(`/admin/crawl/${resortId}`)}
            className="flex items-end gap-2"
          >
            <input type="hidden" name="origin" value={origin} />
            <SourceModeSelect sourceModes={sourceModes} />
            <button
              type="submit"
              className="h-9 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
            >
              切り替える
            </button>
          </form>
        ) : null}
      </div>

      {fileRuns.legacyApi ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          接続先のサーバーがこの画面より古いため、ファイルに残る記録は読めません。
          サーバーへ最新をデプロイすると表示されます（DBの実行記録は表示できています）。
        </p>
      ) : origin === "FILE" ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          このスキー場の結果はまだサーバーのDBに送られていません。クローラーが
          保存したファイル（latest_data）の記録を表示しています。
        </p>
      ) : null}

      <div className="mb-4">
        <CountTrend runs={shown.runs} kinds={["COURSES", "LIFTS"]} />
      </div>

      <RunHistoryTable resortId={resortId} runs={shown.runs} />
      <Pagination
        basePath={`/admin/crawl/${resortId}`}
        query={{ sourceModes: sourceModes.join(","), origin }}
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        total={shown.total}
      />
    </div>
  );
}
