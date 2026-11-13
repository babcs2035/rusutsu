"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deletePost,
  getCommunityAccount,
  getMyPosts,
  startCommunityLogin,
} from "@/features/community/actions";
import { communityComposerUrl } from "@/features/community/composerEvents";
import type { OwnPost } from "@/features/community/contract";
import {
  dayReportsPath,
  dayShareText,
  formatObservedOn,
} from "@/features/community/dayShare";
import { PostReactions } from "@/features/community/PostReactions";
import { ReportSections } from "@/features/community/ReportSections";
import { ShareDayButton } from "@/features/community/ShareDayButton";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { DetailButton } from "@/shared/components/DetailButton";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";

/** 滑走日（新しい順）ごとにまとめる。入力が滑走日の新しい順なので順序を保つ。 */
function groupByDay(posts: OwnPost[]) {
  const days = new Map<string, OwnPost[]>();
  for (const post of posts) {
    const list = days.get(post.observedOn);
    if (list) list.push(post);
    else days.set(post.observedOn, [post]);
  }
  return [...days.entries()];
}

export default function AccountPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // ログイン画面へ移るまでのあいだ、「投稿はありません」を出さない
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<OwnPost | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (cursor?: string) => {
    const result = await getMyPosts(cursor);
    if (result.ok) {
      setPosts(current =>
        cursor ? [...current, ...result.data.posts] : result.data.posts,
      );
      setNextCursor(result.data.nextCursor);
      return;
    }
    // 未ログインならログインへ進める
    const account = await getCommunityAccount();
    if (account.ok && !account.data) {
      setRedirecting(true);
      void startCommunityLogin("/rusutsu/account/posts");
      return;
    }
    setError(result.error);
  }, []);

  const reload = useCallback(() => {
    setError("");
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);
  useEffect(reload, [reload]);

  const more = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    void load(nextCursor).finally(() => setLoadingMore(false));
  };

  const remove = async (post: OwnPost) => {
    const result = await deletePost(post.id, post.version);
    if (result.ok) setPosts(current => current.filter(p => p.id !== post.id));
    else setDeleteErrors(current => ({ ...current, [post.id]: result.error }));
  };

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 pb-10">
      <div className="flex items-center justify-between gap-2 text-sm">
        <Link href="/" className="underline">
          ← 戻る
        </Link>
        <Link href="/account/community" className="underline">
          公開名・通知
        </Link>
      </div>
      <h1 className="text-xl font-bold">自分の投稿</h1>
      {loading || redirecting ? (
        <LoadingSpinner className="h-48 rounded-lg" />
      ) : error ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
          <Button type="button" variant="outline" onClick={reload}>
            再試行
          </Button>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-600">まだ投稿はありません。</p>
      ) : (
        <>
          {groupByDay(posts).map(([observedOn, dayPosts]) => {
            const visible = dayPosts.filter(post => post.status === "VISIBLE");
            return (
              <section key={observedOn} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold whitespace-nowrap">
                    {formatObservedOn(observedOn)}
                  </h2>
                  <span className="text-xs whitespace-nowrap text-gray-500">
                    {dayPosts.length}件
                  </span>
                  {visible.length > 0 && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <DetailButton
                        compact
                        onClick={() =>
                          router.push(
                            dayReportsPath(dayPosts[0].author.id, observedOn),
                          )
                        }
                      >
                        地図で見る
                      </DetailButton>
                      <ShareDayButton
                        authorId={dayPosts[0].author.id}
                        observedOn={observedOn}
                        text={dayShareText(visible, observedOn)}
                        // 見出しの横なので「地図で見る」と同じ高さにする
                        className="h-6 rounded-full px-2"
                      />
                    </div>
                  )}
                </div>
                {dayPosts.map(post => (
                  <article
                    key={post.id}
                    className="rounded-lg border border-gray-200 p-3 text-sm"
                  >
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/${encodeURIComponent(post.resortId)}`}
                        className="min-w-0 truncate text-sm font-bold underline"
                      >
                        {post.resortName}
                      </Link>
                      {post.status === "HIDDEN" && (
                        <Badge className="shrink-0 bg-amber-100 text-amber-800">
                          非表示（確認中）
                        </Badge>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        <time className="text-xs text-gray-500 tabular-nums">
                          {post.observedTime}
                        </time>
                        {post.status === "VISIBLE" && (
                          <Button
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs whitespace-nowrap"
                            onClick={() =>
                              router.push(
                                communityComposerUrl({
                                  resortId: post.resortId,
                                  postId: post.id,
                                }),
                              )
                            }
                          >
                            <Pencil className="size-3.5" />
                            編集
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs whitespace-nowrap"
                          onClick={() => setDeleting(post)}
                        >
                          <Trash2 className="size-3.5" />
                          削除
                        </Button>
                      </span>
                    </div>
                    <ReportSections entries={post.entries} bare />
                    <PostReactions post={post} />
                    {deleteErrors[post.id] && (
                      <p role="alert" className="mt-1 text-xs text-red-700">
                        {deleteErrors[post.id]}
                      </p>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
          {nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              className="w-full rounded border py-2 text-sm"
              onClick={more}
            >
              {loadingMore ? "読み込み中…" : "もっと見る"}
            </button>
          )}
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title="投稿を削除"
        description="この投稿と写真を削除します。元に戻せません。"
        confirmLabel="削除する"
        className="z-[1000]"
        overlayClassName="z-[999]"
        onConfirm={() => {
          if (deleting) void remove(deleting);
        }}
      />
    </main>
  );
}
