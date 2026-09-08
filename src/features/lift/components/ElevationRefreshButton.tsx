"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { refreshLiftElevations } from "../actions";

export function ElevationRefreshButton({ resortId }: { resortId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const refresh = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setResult(null);
    try {
      const response = await refreshLiftElevations(resortId);
      setResult(
        response.ok
          ? {
              ok: true,
              message:
                "全リフトの標高を取得し、20m間隔のデータを更新しました。",
            }
          : { ok: false, message: response.errors.join("\n") },
      );
    } catch (error) {
      setResult({
        ok: false,
        message: `標高取得の完了を確認できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isLoading}
        onClick={() => void refresh()}
      >
        {isLoading ? "リフトの標高を取得中…" : "全リフトの標高を再取得"}
      </Button>
      <p className="text-[11px] text-gray-600">
        保存済みの全リフト・中間駅の標高を国土地理院から取得します。下書きは対象外です。取得には数分かかることがあります。
      </p>
      {isLoading && (
        <p role="status" className="text-xs text-gray-600">
          取得が終わるまで、この画面でお待ちください。
        </p>
      )}
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`whitespace-pre-line text-xs ${result.ok ? "text-green-800" : "text-red-700"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
