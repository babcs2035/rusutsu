import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunDetailView } from "@/features/crawl-monitor/components/RunDetailView";
import { formatJst } from "@/features/crawl-monitor/utils/labels";
import { requireAdmin } from "@/lib/requireAdmin";
import { readSkiResortNames } from "@/lib/skiResortData";
import { fetchCrawlMonitorRunDetail } from "@/server/crawl-latest/adminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "クロール結果の詳細 | 管理画面" };

export default async function CrawlMonitorRunPage({
  params,
}: {
  params: Promise<{ resortId: string; runId: string }>;
}) {
  await requireAdmin();
  const { resortId, runId } = await params;
  const detail = await fetchCrawlMonitorRunDetail(resortId, runId);
  if (!detail) notFound();

  const names = await readSkiResortNames([resortId]);
  const resortName =
    names.find(name => name.id === resortId)?.nameJa ?? resortId;

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
        <Link
          href={`/admin/crawl/${resortId}`}
          className="underline-offset-2 hover:underline"
        >
          {resortName}
        </Link>
        <span className="mx-1">/</span>
        <span>{formatJst(detail.run.observedAt)}</span>
      </nav>
      <h1 className="mb-6 font-[var(--font-heading)] text-2xl font-bold text-gray-900 md:text-3xl">
        {resortName} の取得結果
      </h1>
      <RunDetailView detail={detail} />
    </div>
  );
}
