"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** 監視画面の読込エラーを表示し，再試行の入口を提供する． */
export default function CrawlMonitorError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("クローラー監視の表示に失敗しました", error);
  }, [error]);

  const isApiError = error.message.includes("正本データAPI");

  return (
    <div className="mx-auto max-w-[800px] p-4 md:p-8">
      <h1 className="mb-3 font-[var(--font-heading)] text-2xl font-bold text-gray-900">
        クローラー監視を表示できませんでした
      </h1>
      <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
        {error.message || "不明なエラーが発生しました。"}
      </p>
      {isApiError ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">よくある原因</p>
          <ul className="list-disc pl-5">
            <li>API_BEARER_TOKEN が未設定、または一致していない。</li>
            <li>接続先のサーバーが起動していない、URLが違う。</li>
          </ul>
        </div>
      ) : null}
      <Button
        type="button"
        onClick={() => retry()}
        className="h-9 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
      >
        再試行
      </Button>
    </div>
  );
}
