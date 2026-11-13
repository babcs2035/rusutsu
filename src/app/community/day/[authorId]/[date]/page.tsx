import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDayReports } from "@/features/community/actions";
import { idSchema, observedOnSchema } from "@/features/community/contract";
import { DayReportsView } from "@/features/community/DayReportsView";
import { dayResorts } from "@/features/community/dayShare";
import { createDayShareMetadata } from "@/server/community/dayShareMetadata";
import { getShareMaps, getShareResorts } from "@/server/share/data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ authorId: string; date: string }>;
  searchParams: Promise<{ post?: string }>;
};

// 見出し（SNSのカード）と本文で同じ取得結果を使う
const load = cache(async (authorId: string, date: string) =>
  idSchema.safeParse(authorId).success &&
  observedOnSchema.safeParse(date).success
    ? getDayReports(authorId, date)
    : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { authorId, date } = await params;
  const result = await load(decodeURIComponent(authorId), date);
  if (!result?.ok || !result.data.posts.length)
    return { title: "現地レポート", robots: { index: false, follow: false } };
  const primary = dayResorts(result.data.posts)[0];
  return createDayShareMetadata(
    result.data,
    (await getShareResorts()).find(resort => resort.id === primary.id),
  );
}

/** 1人が1日（滑走日）に投稿した現地レポートを、地図と一覧で見るページ。 */
export default async function DayReportsPage({ params, searchParams }: Props) {
  const [{ authorId, date }, { post }] = await Promise.all([
    params,
    searchParams,
  ]);
  const result = await load(decodeURIComponent(authorId), date);
  if (!result) notFound();
  const posts = result.ok ? result.data.posts : [];
  const maps = (
    await getShareMaps(dayResorts(posts).map(resort => resort.id))
  ).filter(map => map !== null);
  if (!result.ok || !maps.length)
    return (
      <main className="mx-auto max-w-xl space-y-3 p-4 text-sm">
        <h1 className="text-lg font-bold">現地レポート</h1>
        <p role={result.ok ? undefined : "alert"} className="text-gray-600">
          {result.ok ? "この日の投稿はありません。" : result.error}
        </p>
        <Link href="/" className="underline">
          スキー場を探す
        </Link>
      </main>
    );
  return <DayReportsView data={result.data} maps={maps} initialPostId={post} />;
}
