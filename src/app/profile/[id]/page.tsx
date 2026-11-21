// 公開プロフィールと公開投稿だけを初期表示へ渡す．
import Link from "next/link";
import { PostCard } from "@/features/community/CommunityFeed";
import { getPublicProfile } from "@/server/community/queries";

export const dynamic = "force-dynamic";

/** 閲覧者のリアクションを含むプロフィールを要求ごとに取得する． */
export default async function CommunityProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPublicProfile(id);
  const author = result.ok ? result.data.author : null;
  const posts = result.ok ? result.data.posts : [];
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/" className="text-sm underline">
        ← スキー場を探す
      </Link>
      <h1 className="text-xl font-bold">
        {author?.publicName ?? "プロフィール"}
      </h1>
      <h2 className="font-semibold">投稿履歴</h2>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
      {author && posts.length === 0 && (
        <p className="text-sm text-gray-500">投稿はありません。</p>
      )}
    </main>
  );
}
