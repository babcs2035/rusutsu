"use client";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePost, getPostDetail } from "@/features/community/actions";
import { communityComposerUrl } from "@/features/community/composerEvents";
import type { PublicPost } from "@/features/community/contract";
import { dayReportsPath } from "@/features/community/dayShare";
import { PostReactions } from "@/features/community/PostReactions";
import { PostReportButton } from "@/features/community/PostReportButton";
import { ReportSections } from "@/features/community/ReportSections";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { DetailButton } from "@/shared/components/DetailButton";

export default function CommunityPostDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<PublicPost | null>(null),
    [viewer, setViewer] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [confirming, setConfirming] = useState(false);
  useEffect(() => {
    void getPostDetail(id).then(result => {
      setLoading(false);
      if (!result.ok) {
        setPost(null);
        setError(result.error);
        return;
      }
      setPost(result.data.post);
      setViewer(result.data.viewerId);
    });
  }, [id]);
  const remove = async (target: PublicPost) => {
    const result = await deletePost(target.id, target.version);
    if (result.ok)
      router.replace(`/community/${encodeURIComponent(target.resortId)}`);
    else setError(result.error);
  };
  if (loading) return <main className="p-4">レポートを読み込み中…</main>;
  if (!post)
    return (
      <main className="p-4">
        <p role="alert">{error || "レポートが見つかりません。"}</p>
        <Link href="/" className="underline">
          スキー場を探す
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-10">
      <Link
        href={`/community/${encodeURIComponent(post.resortId)}`}
        className="text-sm underline"
      >
        ← レポート一覧
      </Link>
      <article className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-bold">{post.resortName}の現地レポート</h1>
          <time className="text-sm text-slate-500">
            {post.observedOn} {post.observedTime}
          </time>
        </div>
        <p className="text-sm">
          <Link className="underline" href={`/profile/${post.author.id}`}>
            {post.author.publicName}
          </Link>
        </p>
        <ReportSections entries={post.entries} bare />
        <PostReactions post={post} />
        {/* 本人の「編集」「削除」まで1行に収める */}
        <div className="flex items-center gap-1.5 text-sm">
          <DetailButton
            compact
            aria-label="この日のレポートを地図で見る"
            onClick={() =>
              router.push(
                dayReportsPath(post.author.id, post.observedOn, post.id),
              )
            }
          >
            地図で見る
          </DetailButton>
          <span className="ml-auto" />
          <PostReportButton postId={post.id} />
          {viewer === post.author.id && (
            <>
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
              <Button
                variant="outline"
                className="h-7 gap-1 px-2 text-xs whitespace-nowrap text-red-700"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-3.5" />
                削除
              </Button>
            </>
          )}
        </div>
      </article>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="投稿を削除"
        description="この投稿と写真を削除します。元に戻せません。"
        confirmLabel="削除する"
        className="z-[1000]"
        overlayClassName="z-[999]"
        onConfirm={() => void remove(post)}
      />
    </main>
  );
}
