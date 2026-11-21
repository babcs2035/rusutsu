// 投稿詳細の初期データを現在の閲覧者に対して取得する．
import Link from "next/link";
import { PostDetailView } from "@/features/community/PostDetailView";
import { getPostDetail } from "@/server/community/queries";

export const dynamic = "force-dynamic";

/** 初期表示は RSC で読み，編集の可否だけを操作部品に渡す． */
export default async function CommunityPostDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPostDetail(id);
  if (!result.ok)
    return (
      <main className="p-4">
        <p role="alert">{result.error}</p>
        <Link href="/" className="underline">
          スキー場を探す
        </Link>
      </main>
    );

  const { post, viewerId } = result.data;
  return (
    <PostDetailView
      key={id}
      post={post}
      canEdit={viewerId === post.author.id}
    />
  );
}
