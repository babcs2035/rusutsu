import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountTrend } from "@/features/crawl-monitor/components/CountTrend";
import { CurrentSnapshots } from "@/features/crawl-monitor/components/CurrentSnapshots";
import { Pagination } from "@/features/crawl-monitor/components/Pagination";
import { RunHistoryTable } from "@/features/crawl-monitor/components/RunHistoryTable";
import { SourceModeSelect } from "@/features/crawl-monitor/components/SourceModeSelect";
import {
  pageSize,
  parsePage,
  parseSourceModes,
  type RawSearchParams,
} from "@/features/crawl-monitor/utils/query";
import { requireAdmin } from "@/lib/requireAdmin";
import { readSkiResortNames } from "@/lib/skiResortData";
import {
  fetchCrawlMonitorCurrents,
  fetchCrawlMonitorRuns,
} from "@/server/crawl-latest/adminClient";
import { crawlMonitorResortIdSchema } from "@/server/crawl-latest/adminContract";

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
  const page = parsePage(query.page);

  const [names, currents, runPage] = await Promise.all([
    readSkiResortNames([resortId]),
    fetchCrawlMonitorCurrents(resortId),
    fetchCrawlMonitorRuns({ resortId, sourceModes, page, pageSize }),
  ]);
  const resort = names.find(name => name.id === resortId);
  if (!resort) notFound();

  const pageCount = Math.max(1, Math.ceil(runPage.total / pageSize));

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
        いま公開されている値
      </h2>
      <CurrentSnapshots currents={currents} />

      <div className="mt-8 mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">実行履歴</h2>
        <form
          method="get"
          action={`/admin/crawl/${resortId}`}
          className="flex items-end gap-2"
        >
          <SourceModeSelect sourceModes={sourceModes} />
          <button
            type="submit"
            className="h-9 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
          >
            切り替える
          </button>
        </form>
      </div>

      <div className="mb-4">
        <CountTrend runs={runPage.runs} kinds={["COURSES", "LIFTS"]} />
      </div>

      <RunHistoryTable resortId={resortId} runs={runPage.runs} />
      <Pagination
        basePath={`/admin/crawl/${resortId}`}
        query={{ sourceModes: sourceModes.join(",") }}
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        total={runPage.total}
      />
    </div>
  );
}
