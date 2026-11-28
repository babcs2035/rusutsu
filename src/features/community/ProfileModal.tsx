"use client";

// 公開プロフィールをページ遷移せず、マップの上に重ねる非全画面モーダルで表示する。
// 投稿カードの著者名などを押すと useProfileModal().openProfile(authorId) で開く。
// 背景（マップ）が常に映るよう、幅・高さに上限を置き角丸・枠線を出す。
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { getPublicProfile } from "@/shared/queries/community";
import { PostCard } from "./CommunityFeed";
import { ProfileModalContext } from "./profileModalContext";

type ProfileResult = Awaited<ReturnType<typeof getPublicProfile>>;

export function ProfileModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [result, setResult] = useState<ProfileResult | null>(null);

  const openProfile = useCallback((id: string) => {
    setAuthorId(id);
    setResult(null);
  }, []);
  const close = useCallback(() => {
    setAuthorId(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!authorId) return;
    let cancelled = false;
    void getPublicProfile(authorId)
      .then(loaded => {
        if (!cancelled) setResult(loaded);
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            ok: false,
            error: "プロフィールを読み込めませんでした。",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  return (
    <ProfileModalContext.Provider value={openProfile}>
      {children}
      <Dialog open={authorId !== null} onOpenChange={open => !open && close()}>
        <DialogContent
          showCloseButton
          overlayClassName="z-[999]"
          className="z-[1000] flex max-h-[85dvh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-0 text-sm sm:max-w-lg"
        >
          <DialogTitle className="sr-only">プロフィール</DialogTitle>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <h2 className="min-w-0 truncate text-base font-semibold font-heading text-gray-900">
              {result?.ok ? result.data.author.publicName : "プロフィール"}
            </h2>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!result ? (
              <LoadingSpinner text="読み込み中…" />
            ) : result.ok ? (
              result.data.posts.length > 0 ? (
                result.data.posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onAuthorClick={id => openProfile(id)}
                  />
                ))
              ) : (
                <p className="text-sm text-gray-500">投稿はありません。</p>
              )
            ) : (
              <p role="alert" className="text-sm text-red-700">
                {result.error}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ProfileModalContext.Provider>
  );
}
