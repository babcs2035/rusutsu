import type { Metadata } from "next";
import Link from "next/link";
import { OverviewFilters } from "@/features/crawl-monitor/components/OverviewFilters";
import { OverviewTable } from "@/features/crawl-monitor/components/OverviewTable";
import { Pagination } from "@/features/crawl-monitor/components/Pagination";
import {
  buildOverviewEntries,
  countAttention,
  paginate,
} from "@/features/crawl-monitor/utils/overview";
import {
  pageSize,
  parseOverviewQuery,
  type RawSearchParams,
} from "@/features/crawl-monitor/utils/query";
import { requireAdmin } from "@/lib/requireAdmin";
import { fetchCrawlMonitorOverview } from "@/server/crawl-latest/adminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "クローラー監視 | 管理画面" };

export default async function CrawlMonitorPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();
  const query = parseOverviewQuery(await searchParams);
  const overview = await fetchCrawlMonitorOverview(query.sourceModes);
  const now = Date.now();

  const entries = buildOverviewEntries(overview.rows, query, now);
  const counts = countAttention(entries);
  const page = paginate(entries, query.page, pageSize);
  const prefectures = [
    ...new Set(overview.rows.map(row => row.prefecture)),
  ].sort((left, right) => left.localeCompare(right, "ja"));

  const queryForLinks = {
    q: query.q,
    prefecture: query.prefecture,
    status: query.status,
    sourceModes: query.sourceModes.join(","),
  };

  return (
    <div className="mx-auto min-h-[calc(100vh-64px)] max-w-[1200px] p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[var(--font-heading)] text-2xl font-bold text-gray-900 md:text-3xl">
          クローラー監視
        </h1>
        <Link
          href="/admin/crawl/issues"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
        >
          警告・失敗の一覧へ
        </Link>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        正常 {counts.ok} 件 / 失敗 {counts.failed} / 警告 {counts.warning} /
        対応表に取りこぼし {counts.mappingGap} / 未取得 {counts.missing} /
        更新停止 {counts.stale}。スキー場名を押すと、そのスキー場の取得内容と
        履歴を確認できます。
      </p>

      <div className="mb-4">
        <OverviewFilters query={query} prefectures={prefectures} />
      </div>

      <OverviewTable entries={page.items} now={now} />
      <Pagination
        basePath="/admin/crawl"
        query={queryForLinks}
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
      />
    </div>
  );
}
