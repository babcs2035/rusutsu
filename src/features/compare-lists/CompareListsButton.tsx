"use client";

import { ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { useCompareLists } from "./CompareListsProvider";
import type { CompareListSummary } from "./types";

/**
 * ホームの比較チップの横に出す「比較リスト ›」。保存したリストが1件以上あるときだけ出し、
 * 押すと一覧を開く。リストを選ぶとその比較を開く。
 */
export function CompareListsButton({
  onOpenList,
  className,
}: {
  onOpenList: (list: CompareListSummary) => void;
  className?: string;
}) {
  const compareLists = useCompareLists();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<CompareListSummary | null>(null);
  if (!compareLists || compareLists.lists.length === 0) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
      >
        比較リスト
        <ChevronRight className="size-3.5" strokeWidth={2.5} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[1000] flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden sm:max-w-sm"
          overlayClassName="z-[999]"
        >
          <DialogTitle>比較リスト</DialogTitle>
          <DialogDescription className="sr-only">
            保存した比較リストを選ぶと比較を開きます
          </DialogDescription>
          <ul className="-mx-1 min-h-0 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
            {compareLists.lists.map(list => (
              <li key={list.id} className="flex items-center gap-1 py-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-blue-50"
                  onClick={() => {
                    setOpen(false);
                    onOpenList(list);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                    {list.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500">
                    {list.resortIds.length}件
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-blue-700"
                    strokeWidth={2.5}
                  />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-gray-500 hover:text-red-600"
                  aria-label={`${list.name}を削除`}
                  onClick={() => setDeleting(list)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={value => {
          if (!value) setDeleting(null);
        }}
        title="比較リストを削除しますか？"
        description={deleting ? `「${deleting.name}」を削除します。` : ""}
        confirmLabel="削除する"
        onConfirm={() => {
          if (deleting) void compareLists.remove(deleting.id);
        }}
        className="z-[1001]"
        overlayClassName="z-[1000]"
      />
    </>
  );
}
