import Link from "next/link";
import { CommunityFeed } from "@/features/community/CommunityFeed";
import { getCommunityFeed } from "@/server/community/queries";

export const dynamic = "force-dynamic";

/** 最初の一覧を表示してから，条件変更や続きの取得をブラウザーで扱う． */
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ resortId: string }>;
}) {
  const { resortId } = await params;
  const initialFeed = await getCommunityFeed({ resortId, sort: "observed" });
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm underline">
          ← スキー場を探す
        </Link>
        <Link
          href={`/community/${encodeURIComponent(resortId)}/photos`}
          className="text-sm underline"
        >
          写真一覧
        </Link>
      </div>
      <h1 className="text-xl font-bold">みんなの投稿</h1>
      <CommunityFeed
        key={resortId}
        resortId={resortId}
        hideHeading
        initialFeed={initialFeed}
      />
    </main>
  );
}
