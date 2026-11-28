"use client";

// 投稿詳細をページ遷移せず、非全画面モーダルで表示する。
// 地図プレビューの「詳細を開く」から開く。PostDetailView は見出し・操作を
// 自ら描画するため、Dialog の閉じるボタンは出さず内部の操作で閉じる。
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { getPostDetail } from "@/shared/queries/community";
import { PostDetailView } from "./PostDetailView";
import { PostDetailModalContext } from "./postDetailModalContext";

type DetailResult = Awaited<ReturnType<typeof getPostDetail>>;

export function PostDetailModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [postId, setPostId] = useState<string | null>(null);
  const [result, setResult] = useState<DetailResult | null>(null);

  const open = useCallback((id: string) => {
    setPostId(id);
    setResult(null);
  }, []);
  const close = useCallback(() => {
    setPostId(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    void getPostDetail(postId)
      .then(loaded => {
        if (!cancelled) setResult(loaded);
      })
      .catch(() => {
        if (!cancelled)
          setResult({ ok: false, error: "投稿を読み込めませんでした。" });
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  return (
    <PostDetailModalContext.Provider value={open}>
      {children}
      <Dialog open={postId !== null} onOpenChange={open => !open && close()}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[1001]"
          className="z-[1002] flex max-h-[85dvh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-0 text-sm sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">現地レポート</DialogTitle>
          {!result ? (
            <LoadingSpinner className="flex-1" text="読み込み中…" />
          ) : result.ok ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PostDetailView
                key={postId ?? undefined}
                post={result.data.post}
                canEdit={result.data.viewerId === result.data.post.author.id}
                onBack={close}
                onDeleted={close}
              />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <p role="alert" className="text-sm text-red-700">
                {result.error}
              </p>
              <button
                type="button"
                className="text-sm underline"
                onClick={close}
              >
                閉じる
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PostDetailModalContext.Provider>
  );
}
