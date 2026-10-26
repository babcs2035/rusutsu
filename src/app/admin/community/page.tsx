import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  resolveCommunityReport,
  retryCommunityModeration,
  reviewCommunityContent,
  setCommunitySuspension,
} from "@/server/community/admin";

function ReviewButtons({
  id,
  kind,
  version,
  status,
}: {
  id: string;
  kind: string;
  version: number;
  status: string;
}) {
  return (
    <form action={reviewCommunityContent} className="flex flex-wrap gap-2">
      <input type="hidden" name="targetId" value={id} />
      <input type="hidden" name="targetKind" value={kind} />
      <input type="hidden" name="version" value={version} />
      <button
        type="submit"
        name="decision"
        value={status === "VISIBLE" ? "HIDE" : "RESTORE"}
        className="rounded border px-3 py-1"
      >
        {status === "VISIBLE" ? "一時非表示" : "復旧する"}
      </button>
      <button
        type="submit"
        name="decision"
        value="DELETE"
        className="rounded border px-3 py-1 text-red-700"
      >
        削除する
      </button>
    </form>
  );
}
export default async function CommunityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const page = Math.max(
    1,
    Math.min(10000, Number((await searchParams).page) || 1),
  );
  const [reports, posts, comments, pending, failed, hidden, suspended] =
    await Promise.all([
      prisma.communityReport.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      prisma.communityPost.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 50,
        skip: (page - 1) * 50,
        include: {
          author: { select: { id: true, publicName: true } },
          photos: { select: { id: true } },
          entries: { orderBy: { position: "asc" } },
        },
      }),
      prisma.communityComment.findMany({
        where: { status: "HIDDEN" },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { author: { select: { publicName: true } } },
      }),
      prisma.communityModerationJob.count({
        where: { status: { in: ["PENDING", "RUNNING"] } },
      }),
      prisma.communityModerationJob.count({ where: { status: "FAILED" } }),
      prisma.communityPost.count({ where: { status: "HIDDEN" } }),
      prisma.user.findMany({
        where: { suspendedAt: { not: null } },
        select: { id: true, publicName: true },
        take: 100,
      }),
    ]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">みんなの投稿の管理</h1>
        <Link href="/admin/corrections" className="underline">
          情報修正の確認
        </Link>
      </div>
      <p>
        未確認の通報 {reports.length}件 · 非表示 {hidden}件 · AIチェック待ち{" "}
        {pending}件 · 失敗 {failed}件
      </p>
      {!process.env.OPENAI_API_KEY && !process.env.COMMUNITY_MODERATION_URL && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3">
          AI判定サービスが未設定です。AIチェックは待機しています。投稿は公開され、ここで確認できます。
        </p>
      )}
      {!process.env.COMMUNITY_MODERATION_URL && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3">
          写真のAI確認はサイト内の判定サービス（COMMUNITY_MODERATION_URL）が必要です。写真を外部サービスへ送信することはありません。
        </p>
      )}
      {failed > 0 && (
        <form action={retryCommunityModeration}>
          <button type="submit" className="rounded border bg-white px-3 py-2">
            失敗したAIチェックを再試行
          </button>
        </form>
      )}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">通報</h2>
        {reports.map(report => (
          <article
            key={report.id}
            className="space-y-2 rounded border bg-white p-3"
          >
            <p>
              {report.reason} ·{" "}
              {report.targetKind === "POST" ? "投稿" : "コメント"}{" "}
              {report.targetId}
            </p>
            <p className="whitespace-pre-wrap">{report.body}</p>
            {report.targetKind === "POST" && (
              <Link
                className="underline"
                href={`/community/post/${report.targetId}`}
              >
                公開画面
              </Link>
            )}
            <form action={resolveCommunityReport}>
              <input type="hidden" name="id" value={report.id} />
              <button type="submit" className="rounded border px-3 py-1">
                確認済みにする
              </button>
            </form>
          </article>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">投稿</h2>
        {posts.map(post => (
          <article
            key={post.id}
            className="space-y-2 rounded border bg-white p-3"
          >
            <div className="flex flex-wrap gap-2">
              <strong>{post.author.publicName ?? "匿名"}</strong>
              <span>
                現地レポート · {post.observedOn} {post.observedTime} ·{" "}
                {post.status === "HIDDEN" ? "非表示" : "公開中"}
              </span>
              <Link className="underline" href={`/community/post/${post.id}`}>
                公開画面
              </Link>
            </div>
            <p>{post.resortId}</p>
            {post.entries.map(entry => (
              <div key={entry.id} className="rounded border bg-slate-50 p-2">
                <b>
                  {entry.kind} · {entry.targetName}
                </b>
                <p className="whitespace-pre-wrap">{entry.body}</p>
                {entry.itemType && (
                  <p>
                    {entry.itemType} {entry.size}
                  </p>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {post.photos.map(photo => (
                <a
                  key={photo.id}
                  href={`/rusutsu/api/community/photos/${photo.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {/* biome-ignore lint/performance/noImgElement: private authenticated media */}
                  <img
                    alt="投稿写真"
                    src={`/rusutsu/api/community/photos/${photo.id}`}
                    className="size-24 rounded object-cover"
                  />
                </a>
              ))}
            </div>
            <ReviewButtons
              id={post.id}
              kind="POST"
              version={post.version}
              status={post.status}
            />
            <details>
              <summary>この投稿者の利用制限</summary>
              <form
                action={setCommunitySuspension}
                className="mt-2 flex flex-wrap gap-2"
              >
                <input type="hidden" name="userId" value={post.authorId} />
                <input type="hidden" name="suspend" value="true" />
                <label>
                  投稿を停止するには「変更」と入力{" "}
                  <input
                    name="confirm"
                    className="w-20 rounded border p-1"
                    required
                  />
                </label>
                <button type="submit" className="rounded border px-2">
                  投稿を停止
                </button>
              </form>
              <p className="text-xs">
                本人による削除は引き続き可能です。AIはこの操作を行いません。
              </p>
            </details>
          </article>
        ))}
        <div className="flex gap-4">
          {page > 1 && (
            <Link href={`/admin/community?page=${page - 1}`}>前へ</Link>
          )}
          {posts.length === 50 && (
            <Link href={`/admin/community?page=${page + 1}`}>次へ</Link>
          )}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">非表示のコメント</h2>
        {comments.map(comment => (
          <article
            key={comment.id}
            className="space-y-2 rounded border bg-white p-3"
          >
            <p>{comment.author.publicName ?? "匿名"}</p>
            <p className="whitespace-pre-wrap">{comment.body}</p>
            <Link
              href={`/community/post/${comment.postId}`}
              className="underline"
            >
              対象投稿
            </Link>
            <ReviewButtons
              id={comment.id}
              kind="COMMENT"
              version={comment.version}
              status={comment.status}
            />
          </article>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">投稿を停止中のアカウント</h2>
        {suspended.map(user => (
          <form
            key={user.id}
            action={setCommunitySuspension}
            className="flex flex-wrap gap-2 rounded border bg-white p-3"
          >
            <span>{user.publicName ?? "匿名"}</span>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="suspend" value="false" />
            <label>
              「変更」と入力{" "}
              <input
                name="confirm"
                className="w-20 rounded border p-1"
                required
              />
            </label>
            <button type="submit" className="rounded border px-2">
              投稿を再開
            </button>
          </form>
        ))}
      </section>
    </main>
  );
}
