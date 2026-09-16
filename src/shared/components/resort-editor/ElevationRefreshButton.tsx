"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { refreshLiftElevations } from "@/features/lift/actions";
import { refreshSlopeElevations } from "@/features/slope/actions";

export function ElevationRefreshButton({
  resortId,
  kind,
  sourceKind = "curated",
}: {
  resortId: string;
  kind: "lift" | "slope";
  sourceKind?: "curated" | "osm";
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const label = kind === "lift" ? "リフト" : "コース";
  const refresh = async () => {
    setIsStarting(true);
    setResult(null);
    try {
      const response =
        kind === "lift"
          ? await refreshLiftElevations(resortId)
          : await refreshSlopeElevations(resortId, sourceKind);
      setResult(
        response.ok
          ? {
              ok: true,
              message: `全${label}の標高取得をバックグラウンドで開始しました。編集を続けられます。`,
            }
          : { ok: false, message: response.errors.join("\n") },
      );
    } catch (error) {
      setResult({
        ok: false,
        message: `開始できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsStarting(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isStarting}
        onClick={() => void refresh()}
      >
        {isStarting
          ? "開始中…"
          : `全${label}の標高取得${kind === "slope" ? (sourceKind === "osm" ? "（OSM）" : "（確認済み）") : ""}`}
      </Button>
      <p className="text-[11px] text-gray-600">
        {kind === "slope"
          ? sourceKind === "osm"
            ? "OSMデータ"
            : "確認済みデータ"
          : "保存済みデータ"}
        の{label}
        {kind === "lift" ? "・中間駅" : ""}
        を対象に再取得します。下書きは対象外です。
      </p>
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
