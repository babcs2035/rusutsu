"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  deleteComment,
  deletePost,
  getPostDetail,
  reportCommunityContent,
  saveComment,
  setPostLike,
} from "@/features/community/actions";
import type { PublicComment, PublicPost } from "@/features/community/contract";
import { ReportSections } from "@/features/community/ReportSections";
import { withAnonymousCheck } from "@/features/corrections/anonymousCheck";

export default function CommunityPostDetail() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<PublicPost | null>(null),
    [comments, setComments] = useState<PublicComment[]>([]),
    [viewer, setViewer] = useState<string | null>(null);
  const [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [editingComment, setEditingComment] = useState<string | null>(null),
    [editBody, setEditBody] = useState("");
  const [busy, start] = useTransition();
  const reload = useCallback(() => {
    void getPostDetail(id).then(result => {
      setLoading(false);
      if (!result.ok) {
        setPost(null);
        setError(result.error);
        return;
      }
      setPost(result.data.post);
      setComments(result.data.comments);
      setViewer(result.data.viewerId);
    });
  }, [id]);
  useEffect(reload, [reload]);
  const report = (kind: "POST" | "COMMENT", target: string) => {
    const reason = prompt(
      "理由を入力: 不適切な内容 / 迷惑行為 / 個人情報 / その他",
      "その他",
    );
    if (reason == null) return;
    const detail = prompt("報告内容（任意）") ?? "";
    start(async () => {
      const result = await withAnonymousCheck(proof =>
        reportCommunityContent(
          kind,
          target,
          ["不適切な内容", "迷惑行為", "個人情報", "その他"].includes(reason)
            ? reason
            : "その他",
          detail,
          proof,
        ),
      );
      if (!result.ok) setError(result.error);
    });
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
        <ReportSections entries={post.entries} />
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-1.5"
            onClick={() =>
              start(async () => {
                const result = await setPostLike(post.id, !post.liked);
                if (result.ok) reload();
                else setError(result.error);
              })
            }
          >
            {post.liked ? "♥" : "♡"} {post.likeCount}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-1.5"
            onClick={() => report("POST", post.id)}
          >
            報告する
          </button>
          {viewer === post.author.id && (
            <>
              <Link
                className="rounded border px-3 py-1.5"
                href={`/community/${encodeURIComponent(post.resortId)}/new?edit=${encodeURIComponent(post.id)}`}
              >
                レポートを編集
              </Link>
              <button
                type="button"
                disabled={busy}
                className="rounded border px-3 py-1.5 text-red-700"
                onClick={() => {
                  if (
                    !confirm("このレポートと含まれる項目・写真を削除しますか？")
                  )
                    return;
                  start(async () => {
                    const result = await deletePost(post.id, post.version);
                    if (result.ok)
                      location.href = `/rusutsu/community/${encodeURIComponent(post.resortId)}`;
                    else setError(result.error);
                  });
                }}
              >
                削除
              </button>
            </>
          )}
        </div>
      </article>
      <section className="space-y-3">
        <h2 className="font-semibold">コメント {post.commentCount}件</h2>
        {comments.map(comment => (
          <div
            key={comment.id}
            className="rounded-lg border bg-white p-3 text-sm"
          >
            <p className="mb-1 text-xs text-slate-500">
              {comment.author.publicName} ·{" "}
              {new Date(comment.createdAt).toLocaleString("ja-JP")}
            </p>
            {editingComment === comment.id ? (
              <div className="space-y-2">
                <textarea
                  aria-label="コメントを編集"
                  className="min-h-20 w-full rounded border p-2"
                  maxLength={2000}
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !editBody.trim()}
                  className="rounded border px-2 py-1"
                  onClick={() =>
                    start(async () => {
                      const result = await saveComment(
                        post.id,
                        editBody,
                        crypto.randomUUID(),
                        comment.id,
                        comment.version,
                      );
                      if (result.ok) {
                        setEditingComment(null);
                        reload();
                      } else setError(result.error);
                    })
                  }
                >
                  保存
                </button>
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => setEditingComment(null)}
                >
                  取り消す
                </button>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words">{comment.body}</p>
            )}
            <div className="mt-2 flex gap-3 text-xs">
              <button
                type="button"
                disabled={busy}
                className="underline"
                onClick={() => report("COMMENT", comment.id)}
              >
                報告
              </button>
              {viewer === comment.author.id && (
                <>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setEditingComment(comment.id);
                      setEditBody(comment.body);
                    }}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-red-700 underline"
                    onClick={() => {
                      if (!confirm("コメントを削除しますか？")) return;
                      start(async () => {
                        const result = await deleteComment(
                          comment.id,
                          comment.version,
                        );
                        if (result.ok) reload();
                        else setError(result.error);
                      });
                    }}
                  >
                    削除
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        <form
          className="flex items-end gap-2"
          onSubmit={e => {
            e.preventDefault();
            if (!body.trim()) return;
            start(async () => {
              const result = await saveComment(
                post.id,
                body,
                crypto.randomUUID(),
              );
              if (result.ok) {
                setBody("");
                reload();
              } else setError(result.error);
            });
          }}
        >
          <textarea
            aria-label="コメントを書く"
            placeholder="この日のレポートにコメント"
            className="min-h-20 min-w-0 flex-1 rounded border bg-white p-2 text-sm"
            maxLength={2000}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded border bg-white px-3 py-2 text-sm"
          >
            送信
          </button>
        </form>
      </section>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </main>
  );
}
