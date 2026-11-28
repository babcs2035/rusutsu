// 投稿詳細で本人の編集・削除と地図への移動を扱う．
"use client";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePost } from "@/features/community/actions";
import { communityComposerUrl } from "@/features/community/composerEvents";
import type { PublicPost } from "@/features/community/contract";
import { useDayReportsModal } from "@/features/community/dayReportsModalContext";
import { PostReactions } from "@/features/community/PostReactions";
import { PostReportButton } from "@/features/community/PostReportButton";
import { useProfileModal } from "@/features/community/profileModalContext";
import { ReportSections } from "@/features/community/ReportSections";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { DetailButton } from "@/shared/components/DetailButton";

/** サーバーが取得した公開投稿を表示し，削除結果を画面へ反映する． */
export function PostDetailView({
  post,
  canEdit,
  onBack,
  onDeleted,
}: {
  post: PublicPost;
  canEdit: boolean;
  /** 「← レポート一覧」の遷移先。未指定ならコミュニティ一覧へ router 遷移 */
  onBack?: () => void;
  /** 削除成功後の遷移先。未指定ならコミュニティ一覧へ router 遷移 */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const openProfile = useProfileModal();
  const openDayReports = useDayReportsModal();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const remove = async (target: PublicPost) => {
    const result = await deletePost(target.id, target.version);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const afterDelete =
      onDeleted ??
      (() =>
        router.replace(`/community/${encodeURIComponent(target.resortId)}`));
    afterDelete();
  };
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-10">
      {onBack ? (
        <button type="button" className="text-sm underline" onClick={onBack}>
          ← レポート一覧
        </button>
      ) : (
        <Link
          href={`/community/${encodeURIComponent(post.resortId)}`}
          className="text-sm underline"
        >
          ← レポート一覧
        </Link>
      )}
      <article className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-bold">{post.resortName}の現地レポート</h1>
          <time className="text-sm text-slate-500">
            {post.observedOn} {post.observedTime}
          </time>
        </div>
        <p className="text-sm">
          <button
            type="button"
            className="underline"
            onClick={() => openProfile(post.author.id)}
          >
            {post.author.publicName}
          </button>
        </p>
        <ReportSections entries={post.entries} bare />
        <PostReactions post={post} />
        {/* 本人の「編集」「削除」まで1行に収める */}
        <div className="flex items-center gap-1.5 text-sm">
          <DetailButton
            compact
            aria-label="この日のレポートを地図で見る"
            onClick={() =>
              openDayReports({
                authorId: post.author.id,
                observedOn: post.observedOn,
                postId: post.id,
              })
            }
          >
            地図で見る
          </DetailButton>
          <span className="ml-auto" />
          <PostReportButton postId={post.id} />
          {canEdit && (
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
