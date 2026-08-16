"use client";

import { Spinner } from "@/components/ui/spinner";

/**
 * 中央に表示されるアニメーション付きローディングスピナー
 */
export function LoadingSpinner({ text = "読み込み中..." }: { text?: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gray-100"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner className="size-16" />
      <p className="text-lg font-semibold text-gray-500">{text}</p>
    </div>
  );
}
