// 投稿写真一覧をサーバーで取得し，表示に必要な写真だけを描画する．
import Image from "next/image";
import Link from "next/link";
import { getCommunityFeed } from "@/server/community/queries";
import type { PublicPost } from "./contract";

/** コース指定を保ったまま，採用済みの投稿ページを順に取得する． */
export async function CommunityPhotoGallery({
  resortId,
  courseId,
}: {
  resortId: string;
  courseId?: string;
}) {
  const posts: PublicPost[] = [];
  let cursor: string | undefined;
  let failed = false;
  do {
    const result = await getCommunityFeed({
      resortId,
      courseId,
      cursor,
      sort: "observed",
    });
    if (!result.ok) {
      failed = true;
      break;
    }
    posts.push(...result.data.posts);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/community/${encodeURIComponent(resortId)}`}
          className="text-sm underline"
        >
          ← 投稿一覧
        </Link>
        <h1 className="text-xl font-bold">
          {courseId ? "コースの投稿写真" : "投稿写真"}
        </h1>
      </div>
      <p className="text-xs text-gray-600">
        投稿写真は当サイト内で閲覧するためだけに使います。サイト外への転載・広告利用・第三者提供は行いません。
      </p>
      {failed && <p role="alert">投稿写真を読み込めませんでした。</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {posts.flatMap(post =>
          post.entries
            .filter(entry => !courseId || entry.courseId === courseId)
            .flatMap(entry => entry.photos)
            .map(photo => (
              <Link
                key={photo.id}
                href={`/community/post/${encodeURIComponent(post.id)}`}
                className="overflow-hidden rounded-lg border"
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
              </Link>
            )),
        )}
      </div>
    </main>
  );
}
