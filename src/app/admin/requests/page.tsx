import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { InternalDataApiError } from "@/lib/internalDataApiClient";
import { requireEditingPage } from "@/server/edit-requests/authPages";
import {
  EDIT_KIND_LABELS,
  type EditKind,
  REQUEST_STATUS_LABELS,
} from "@/server/edit-requests/contract";
import { listEditRequests } from "@/server/edit-requests/repository";

export const dynamic = "force-dynamic";

const filters = [
  { key: "PENDING", label: "確認待ち" },
  { key: "APPLIED", label: "反映済み" },
  { key: "OTHER", label: "その他" },
  { key: "ALL", label: "すべて" },
] as const;
const statusClass: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  APPLIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  WITHDRAWN: "bg-slate-100 text-slate-700 ring-slate-200",
  CONFLICT: "bg-rose-50 text-rose-800 ring-rose-200",
};

export default async function EditRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireEditingPage();
  let result: Awaited<ReturnType<typeof listEditRequests>>;
  try {
    result = await listEditRequests();
  } catch (error) {
    if (!(error instanceof InternalDataApiError)) throw error;
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <h1 className="text-2xl font-bold">編集申請</h1>
        <p role="alert">{error.message}</p>
        <Link className="underline" href="/admin">
          管理ダッシュボードへ
        </Link>
      </main>
    );
  }
  const { isAdmin, requests } = result;
  const requestedStatus = (await searchParams).status;
  const activeFilter =
    filters.find(item => item.key === requestedStatus)?.key ??
    (isAdmin ? "PENDING" : "ALL");
  const counts = {
    PENDING: requests.filter(request => request.status === "PENDING").length,
    APPLIED: requests.filter(request => request.status === "APPLIED").length,
    OTHER: requests.filter(
      request => !["PENDING", "APPLIED"].includes(request.status),
    ).length,
    ALL: requests.length,
  };
  const visible = requests.filter(request =>
    activeFilter === "ALL"
      ? true
      : activeFilter === "OTHER"
        ? !["PENDING", "APPLIED"].includes(request.status)
        : request.status === activeFilter,
  );
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 pb-12 md:p-8">
      <Link
        href="/admin"
        className="text-sm text-slate-600 underline underline-offset-4"
      >
        ← 管理ダッシュボード
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-950 md:text-3xl">
          {isAdmin ? "編集申請を確認" : "自分の申請"}
        </h1>
        <p className="text-sm text-slate-600">
          {isAdmin
            ? "申請の内容を確認して、承認・修正・却下できます。"
            : "申請した内容と、その後の確認結果を見られます。"}
        </p>
      </header>
      <nav aria-label="申請の状態" className="flex flex-wrap gap-2">
        {filters.map(filter => (
          <Link
            key={filter.key}
            href={`/admin/requests?status=${filter.key}`}
            aria-current={activeFilter === filter.key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === filter.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {filter.label}{" "}
            <span className="tabular-nums">{counts[filter.key]}</span>
          </Link>
        ))}
      </nav>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-800">
            {activeFilter === "PENDING"
              ? "確認待ちの申請はありません"
              : "この状態の申請はありません"}
          </p>
          {counts.ALL > 0 && (
            <p className="mt-2 text-sm text-slate-500">
              別の状態を選ぶと過去の申請を見られます。
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map(request => (
            <li key={request.id}>
              <Link
                href={`/admin/requests/${request.id}`}
                className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass[request.status] ?? statusClass.WITHDRAWN}`}
                    >
                      {REQUEST_STATUS_LABELS[request.status] ?? request.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      {EDIT_KIND_LABELS[request.kind as EditKind] ??
                        request.kind}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-950 group-hover:underline group-hover:underline-offset-4">
                    {request.resortName || request.resortId}
                    <span className="ml-2 text-base font-normal text-slate-600">
                      {EDIT_KIND_LABELS[request.kind as EditKind] ??
                        request.kind}
                      の変更
                    </span>
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3.5" />
                      {new Date(request.createdAt).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                      })}
                    </span>
                    {isAdmin && <span>申請者: {request.authorName}</span>}
                    {request.resortName && <span>ID: {request.resortId}</span>}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-slate-700">
                  {isAdmin && request.status === "PENDING"
                    ? "申請を確認"
                    : "内容を見る"}
                  <ArrowRight className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        申請は新しい順に最大200件表示しています。
      </p>
    </main>
  );
}
