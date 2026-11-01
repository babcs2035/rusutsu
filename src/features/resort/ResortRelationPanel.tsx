"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { unlinkSkiResortsFromAdmin } from "./mergeActions";

/** 完全統合の関係と、その解除操作。統合していなければ何も出さない。 */
export function ResortRelationPanel({
  resort,
  resorts,
  onUpdated,
}: {
  resort: AdminSkiResortRecord;
  resorts: AdminSkiResortRecord[];
  onUpdated: (updated: AdminSkiResortRecord[], message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameOf = (id: string) =>
    resorts.find(item => item.id === id)?.nameJa ?? id;
  const parent = resort.mergedIntoId
    ? resorts.find(item => item.id === resort.mergedIntoId)
    : null;
  // 完全統合は結合先でも結合元でも、結合先の単位で解除する
  const area = resort.sourceResortIds.length ? resort : (parent ?? null);
  if (!area) return null;

  const unmerge = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await unlinkSkiResortsFromAdmin({
          id: area.id,
          expectedUpdatedAt: area.updatedAt,
        });
        if (result.status === "error") setError(result.message);
        else
          onUpdated(
            [result.resort, ...result.sources],
            "完全統合を解除しました。",
          );
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1">
          <span className="font-bold">完全統合「{area.nameJa}」</span>：
          {area.sourceResortIds.map(nameOf).join("・")}
          を1つのスキー場「{area.id}」として公開しています。
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          統合を解除
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="完全統合を解除しますか？"
        description={`結合元を通常のスキー場に戻し、「${area.nameJa}」は非公開にします。結合先の地図・料金・レビューのデータは削除せずに残ります。`}
        confirmLabel="統合を解除"
        cancelLabel="キャンセル"
        onConfirm={() => {
          unmerge();
          setConfirming(false);
        }}
      />
    </section>
  );
}
