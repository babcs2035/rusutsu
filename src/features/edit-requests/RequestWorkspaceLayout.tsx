"use client";

import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** リフト・コースの申請確認で共通の、左に地図・右に詳細の画面枠。 */
export function RequestWorkspaceLayout({
  title,
  authorName,
  createdAt,
  status,
  statusClass,
  editing,
  editDisabled,
  onEdit,
  fullEditorHref,
  map,
  footer,
  message,
  children,
}: {
  title: string;
  authorName: string;
  createdAt: string;
  status: string;
  statusClass: string;
  editing: boolean;
  editDisabled: boolean;
  onEdit?: () => void;
  /** 通常の編集画面で申請内容を開くリンク。管理者が確認待ちの申請を見るときだけ渡す */
  fullEditorHref?: string;
  map: ReactNode;
  footer?: ReactNode;
  message?: string;
  children: ReactNode;
}) {
  return (
    <main className="admin-request-workspace flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Link
          href="/admin/requests"
          aria-label="申請一覧へ戻る"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-bold text-slate-950 md:text-base">
              {title}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusClass}`}
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {authorName}さんの申請 ·{" "}
            {new Date(createdAt).toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            })}
          </p>
        </div>
        {onEdit && !editing && (
          <Button
            variant="outline"
            size="sm"
            disabled={editDisabled}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
            ここで編集
          </Button>
        )}
        {fullEditorHref && !editing && (
          <Link
            href={fullEditorHref}
            aria-disabled={editDisabled}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 ${editDisabled ? "pointer-events-none opacity-50" : ""}`}
          >
            <ExternalLink className="size-3.5" />
            編集画面で開く
          </Link>
        )}
        {editing && (
          <span className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900">
            申請内容を編集中
          </span>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(12rem,35%)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(26rem,42%)] md:grid-rows-1">
        <section
          aria-label="スキー場全体の地図"
          className="relative min-h-0 min-w-0 overflow-hidden border-b border-slate-200 md:border-r md:border-b-0"
        >
          {map}
        </section>
        <aside
          aria-label="申請の確認と編集"
          className="flex min-h-0 min-w-0 flex-col bg-white"
        >
          {children}
          {(footer || message) && (
            <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              {message && (
                <p
                  role="status"
                  className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-xs text-slate-700"
                >
                  {message}
                </p>
              )}
              {footer}
            </footer>
          )}
        </aside>
      </div>
    </main>
  );
}
