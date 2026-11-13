import type { Metadata } from "next";
import type { DayReports } from "@/features/community/contract";
import {
  dayKindSummary,
  dayReportsPath,
  dayShareTitle,
} from "@/features/community/dayShare";
import { createShareMetadata, PUBLIC_ORIGIN } from "@/server/share/metadata";

type Resort = { id: string; nameJa: string; urlCode: number };

/**
 * 1日分の現地レポートをSNSで共有したときのカード。
 * 画像はスキー場の共有用マップをそのまま使う。SNS側に長く残るので、
 * 投稿の本文や写真は入れず、スキー場・日付・件数だけを書く。
 */
export function createDayShareMetadata(
  data: DayReports,
  primaryResort: Resort | undefined,
): Metadata {
  const title = dayShareTitle(data.posts, data.observedOn);
  const description = `${data.author.publicName}さんの現地レポート（${dayKindSummary(data.posts)}）。地図で場所を確かめながら読めます。`;
  const page = `${PUBLIC_ORIGIN}/rusutsu${dayReportsPath(data.author.id, data.observedOn)}`;
  const base = primaryResort ? createShareMetadata([primaryResort]) : {};
  return {
    title,
    description,
    // 日ごとの投稿ページは検索結果に出さない。SNSのカードは従来どおり作られる
    robots: { index: false, follow: true },
    alternates: { canonical: page },
    openGraph: {
      ...base.openGraph,
      title: `${title} | Rusutsu`,
      description,
      url: page,
    },
    twitter: {
      ...base.twitter,
      title: `${title} | Rusutsu`,
      description,
    },
  };
}
