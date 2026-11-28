"use client";

// 全フィード（みんなの投稿）をページ遷移せず、非全画面モーダルで表示する。
// コンパクト一覧の「すべて見る」から開く。CommunityFeed はフィルタ・投稿・
// 続き取得を自ら扱うため、ここでは描画と閉じる操作だけを担当する。
import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CommunityFeed } from "./CommunityFeed";
import { FeedModalContext } from "./feedModalContext";

export function FeedModalProvider({ children }: { children: React.ReactNode }) {
  const [resortId, setResortId] = useState<string | null>(null);

  const open = useCallback((id: string) => setResortId(id), []);
  const close = useCallback(() => setResortId(null), []);

  return (
    <FeedModalContext.Provider value={open}>
      {children}
      <Dialog open={resortId !== null} onOpenChange={open => !open && close()}>
        <DialogContent
          showCloseButton
          overlayClassName="z-[999]"
          className="z-[1000] flex max-h-[85dvh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-0 text-sm sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">みんなの投稿</DialogTitle>
          {resortId && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CommunityFeed
                key={resortId}
                resortId={resortId}
                hideHeading
                correctable
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FeedModalContext.Provider>
  );
}
