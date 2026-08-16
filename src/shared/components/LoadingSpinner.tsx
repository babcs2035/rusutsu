"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * 中央に表示されるアニメーション付きローディングスピナー
 *
 * 外側の div は h-full を使うため，親に確定した高さがないと中央揃えが効かない。
 * 親に高さを渡せない呼び出し元（例: 編集ツールページの dynamic loading）は
 * className で高さ（例: h-[calc(100dvh-4rem)]）を指定すること。
 */
export function LoadingSpinner({
  text = "読み込み中...",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-4 bg-gray-100",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner className="size-16" />
      <p className="text-lg font-semibold text-gray-500">{text}</p>
    </div>
  );
}
