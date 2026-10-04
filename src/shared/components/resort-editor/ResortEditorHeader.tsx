"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

/** 編集パネルの最上部に固定し、編集中のスキー場と1つ前の工程へ戻る操作を出す。 */
export function ResortEditorHeader({
  resortId,
  resortName,
  savedAt,
  backLabel,
  onBack,
}: {
  resortId: string;
  resortName?: string | null;
  savedAt: string | null;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <header className="flex min-w-0 shrink-0 items-start justify-between gap-2 sticky top-0 z-20 border-b bg-white p-3">
      <div className="min-w-0">
        <h2
          className={cn(
            "truncate font-bold text-base",
            resortName ? "font-[var(--font-heading)]" : "font-mono",
          )}
        >
          {resortName || resortId}
        </h2>
        <p className="truncate text-[11px] text-gray-500">
          {savedAt
            ? `自動保存: ${formatDateTime(savedAt)}`
            : "まだ自動保存されていません"}
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="size-3.5" />
        {backLabel}
      </Button>
    </header>
  );
}
