"use client";
import Image from "next/image";

// 投稿写真一覧をページ遷移せず、非全画面モーダルで表示する。
// 「コースの写真」から開く。フィードをクライアントで取得し、写真グリッドを
// 描画する。各写真は投稿詳細モーダルを開く（ページ遷移しない）。
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { getCommunityFeed } from "@/shared/queries/community";
import type { PublicPost } from "./contract";
import { PhotosModalContext, type PhotosTarget } from "./photosModalContext";
import { usePostDetailModal } from "./postDetailModalContext";

export function PhotosModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<PhotosTarget | null>(null);
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const openPostDetail = usePostDetailModal();

  const open = useCallback((next: PhotosTarget) => {
    setTarget(next);
    setPosts([]);
    setFailed(false);
  }, []);
  const close = useCallback(() => {
    setTarget(null);
    setPosts([]);
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      const collected: PublicPost[] = [];
      let cursor: string | undefined;
      try {
        do {
          const result = await getCommunityFeed({
            resortId: target.resortId,
            courseId: target.courseId,
            cursor,
            sort: "observed",
          });
          if (!result.ok) {
            if (!cancelled) setFailed(true);
            break;
          }
          collected.push(...result.data.posts);
          if (cancelled) break;
          setPosts([...collected]);
          cursor = result.data.nextCursor ?? undefined;
        } while (cursor);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  const photos = posts.flatMap(post =>
    post.entries
      .filter(entry => !target?.courseId || entry.courseId === target.courseId)
      .flatMap(entry => entry.photos)
      .map(photo => ({ photo, post })),
  );

  return (
    <PhotosModalContext.Provider value={open}>
      {children}
      <Dialog open={target !== null} onOpenChange={open => !open && close()}>
        <DialogContent
          showCloseButton
          overlayClassName="z-[999]"
          className="z-[1000] flex max-h-[85dvh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-0 text-sm sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">
            {target?.courseId ? "コースの投稿写真" : "投稿写真"}
          </DialogTitle>
          <div className="shrink-0 border-b border-gray-200 px-4 py-3">
            <h2 className="text-base font-semibold font-heading text-gray-900">
              {target?.courseId ? "コースの投稿写真" : "投稿写真"}
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <LoadingSpinner text="写真を読み込み中…" />
            ) : failed ? (
              <p role="alert" className="text-sm text-gray-500">
                投稿写真を読み込めませんでした。
              </p>
            ) : photos.length === 0 ? (
              <p className="text-sm text-gray-500">写真はありません。</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {photos.map(({ photo, post }) => (
                  <button
                    key={photo.id}
                    type="button"
                    className="overflow-hidden rounded-lg border text-left"
                    onClick={() => openPostDetail(post.id)}
                  >
                    <Image
                      className="aspect-square w-full object-cover"
                      src={`/rusutsu/api/community/photos/${encodeURIComponent(photo.id)}?size=thumb`}
                      alt={`${post.observedOn}の投稿写真`}
                      width={photo.width}
                      height={photo.height}
                      unoptimized
                    />
                    <span className="block truncate px-2 py-1 text-xs">
                      {post.author.publicName} · {post.observedOn}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PhotosModalContext.Provider>
  );
}
