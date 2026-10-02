"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import {
  unlinkSkiResortsFromAdmin,
  updateTicketGroupFromAdmin,
} from "./mergeActions";

type PendingAction = "unlink" | "leaveTicketGroup";

/** 連携エリア・共通券の関係と、その解除操作。関係がなければ何も出さない。 */
export function ResortRelationPanel({
  resort,
  resorts,
  onUpdated,
}: {
  resort: AdminSkiResortRecord;
  resorts: AdminSkiResortRecord[];
  onUpdated: (updated: AdminSkiResortRecord[], message: string) => void;
}) {
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameOf = (id: string) =>
    resorts.find(item => item.id === id)?.nameJa ?? id;
  const parent = resort.mergedIntoId
    ? resorts.find(item => item.id === resort.mergedIntoId)
    : null;
  // 連携エリアは親でも子でも、親の単位で解除する
  const area =
    resort.linkKind === "LINKED" && resort.sourceResortIds.length
      ? resort
      : parent?.linkKind === "LINKED"
        ? parent
        : null;
  const ticketPartners = resort.ticketGroupId
    ? resorts.filter(
        item =>
          item.id !== resort.id && item.ticketGroupId === resort.ticketGroupId,
      )
    : [];
  if (!area && !ticketPartners.length) return null;

  const run = (action: PendingAction) => {
    setError(null);
    startTransition(async () => {
      try {
        if (action === "unlink" && area) {
          const result = await unlinkSkiResortsFromAdmin({
            id: area.id,
            expectedUpdatedAt: area.updatedAt,
          });
          if (result.status === "error") setError(result.message);
          else
            onUpdated(
              [result.resort, ...result.sources],
              "連携を解除しました。",
            );
          return;
        }
        const result = await updateTicketGroupFromAdmin({
          action: "clear",
          resort: { id: resort.id, expectedUpdatedAt: resort.updatedAt },
        });
        if (result.status === "error") setError(result.message);
        else onUpdated(result.resorts, "共通券の関係を外しました。");
      } catch {
        setError("通信に失敗しました。再読み込みして状態を確認してください。");
      }
    });
  };

  return (
    <section
      aria-label="ほかのスキー場との関係"
      className="shrink-0 space-y-2 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
    >
      {area && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1">
            <span className="font-bold">連携エリア「{area.nameJa}」</span>：
            {area.sourceResortIds.map(nameOf).join("・")}
            。地図・コース・リフト・料金・レビューは「{area.id}
            」で共通に管理し、全国マップには各スキー場のピンを出します。
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirming("unlink")}
          >
            連携を解除
          </Button>
        </div>
      )}
      {ticketPartners.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1">
            <span className="font-bold">共通券</span>：
            {ticketPartners.map(item => item.nameJa).join("・")}
            も滑走できると表示しています。
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirming("leaveTicketGroup")}
          >
            共通券から外す
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={open => {
          if (!open) setConfirming(null);
        }}
        title={
          confirming === "unlink"
            ? "連携を解除しますか？"
            : "共通券から外しますか？"
        }
        description={
          confirming === "unlink"
            ? `各スキー場を通常のスキー場に戻し、「${area?.nameJa ?? ""}」は非公開にします。エリアの地図・料金・レビューのデータは削除せずに残ります。`
            : "このスキー場の詳細画面から共通券の案内を外します。残りが1件になる場合は、そのスキー場からも外します。"
        }
        confirmLabel={confirming === "unlink" ? "連携を解除" : "共通券から外す"}
        cancelLabel="キャンセル"
        onConfirm={() => {
          if (confirming) run(confirming);
          setConfirming(null);
        }}
      />
    </section>
  );
}
