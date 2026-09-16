import type { Metadata } from "next";
import Link from "next/link";
import { IssueFilters } from "@/features/crawl-monitor/components/IssueFilters";
import { IssueTable } from "@/features/crawl-monitor/components/IssueTable";
import { Pagination } from "@/features/crawl-monitor/components/Pagination";
import {
  pageSize,
  parseIssueQuery,
  type RawSearchParams,
  sinceFromDays,
} from "@/features/crawl-monitor/utils/query";
import { requireAdmin } from "@/lib/requireAdmin";
import { fetchCrawlMonitorIssues } from "@/server/crawl-latest/adminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "クロールの警告 | 管理画面" };

export default async function CrawlMonitorIssuesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();
  const query = parseIssueQuery(await searchParams);
  const page = await fetchCrawlMonitorIssues({
    severity: query.severity,
    code: query.code,
    resortId: query.resortId,
    categoryKind: query.categoryKind,
    sourceModes: query.sourceModes,
    blockingOnly: query.blockingOnly,
    since: sinceFromDays(query.days, Date.now()),
    page: query.page,
    pageSize,
  });
  const pageCount = Math.max(1, Math.ceil(page.total / pageSize));

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
        <span>警告・失敗</span>
      </nav>
      <h1 className="mb-4 font-[var(--font-heading)] text-2xl font-bold text-gray-900 md:text-3xl">
        クロールの警告・失敗
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        「公開値に未反映」は、警告のせいでサイトへ反映されなかった取得結果です。
        まずここから確認してください。
      </p>

      <div className="mb-4">
        <IssueFilters query={query} codes={page.codes} />
      </div>

      <IssueTable issues={page.issues} />
      <Pagination
        basePath="/admin/crawl/issues"
        query={{
          severity: query.severity,
          code: query.code,
          resortId: query.resortId,
          categoryKind: query.categoryKind,
          blockingOnly: query.blockingOnly,
          days: query.days,
          sourceModes: query.sourceModes.join(","),
        }}
        page={Math.min(query.page, pageCount)}
        pageCount={pageCount}
        total={page.total}
      />
    </div>
  );
}
