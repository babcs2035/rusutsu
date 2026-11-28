"use client";

// 滑走日レポートをページ遷移せず、非全画面モーダルで表示する。
// 投稿詳細の「地図で見る」やアカウントの一覧から開く。
// DayReportsView は見出し・×を自ら描画するため、Dialog の閉じるボタンは出さない。
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { PanelHeader } from "@/shared/components/PanelHeader";
import { getAccountDayReports } from "@/shared/queries/community";
import { DayReportsView } from "./DayReportsView";
import {
  DayReportsModalContext,
  type DayReportsTarget,
} from "./dayReportsModalContext";

type DayResult = Awaited<ReturnType<typeof getAccountDayReports>>;

export function DayReportsModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<DayReportsTarget | null>(null);
  const [result, setResult] = useState<DayResult | null>(null);

  const open = useCallback((next: DayReportsTarget) => {
    setTarget(next);
    setResult(null);
  }, []);
  const close = useCallback(() => {
    setTarget(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void getAccountDayReports(target.authorId, target.observedOn)
      .then(loaded => {
        if (!cancelled) setResult(loaded);
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            ok: false,
            error: "地図を読み込めませんでした。もう一度お試しください。",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  return (
    <DayReportsModalContext.Provider value={open}>
      {children}
      <Dialog open={target !== null} onOpenChange={open => !open && close()}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[999]"
          className="z-[1000] flex h-[min(48rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-0 text-sm sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">現地レポート</DialogTitle>
          {!result ? (
            <LoadingSpinner className="flex-1" text="地図を読み込み中…" />
          ) : result.ok ? (
            <DayReportsView
              data={result.data}
              maps={result.maps}
              initialPostId={target?.postId}
              onClose={close}
            />
          ) : (
            <>
              <PanelHeader title="現地レポート" onClose={close} />
              <div className="space-y-3 p-4">
                <p role="alert" className="text-sm text-red-700">
                  {result.error}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DayReportsModalContext.Provider>
  );
}
