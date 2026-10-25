import Link from "next/link";
import { CommunityFeed } from "@/features/community/CommunityFeed";

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ resortId: string }>;
}) {
  const { resortId } = await params;
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
      <CommunityFeed resortId={resortId} hideHeading />
    </main>
  );
}
