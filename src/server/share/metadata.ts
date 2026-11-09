import type { Metadata } from "next";
import { SHARE_IMAGE_VERSION } from "@/features/share/mapCard";
import { COMPARE_PARAM, encodeCompareCodes } from "@/shared/utils/comparePath";

const PUBLIC_ORIGIN = "https://ktak.dev";
type Resort = { id: string; nameJa: string; urlCode: number };

/** 絶対URLを返す。Hostヘッダーやクライアントの描画状態には依存しない。 */
export function createShareMetadata(
  resorts: Resort[],
  comparison = false,
): Metadata {
  if (!resorts.length) return {};
  const names = resorts.map(resort => resort.nameJa);
  const title = comparison
    ? `${names.slice(0, 4).join("・")}${resorts.length > 4 ? ` ほか${resorts.length - 4}件` : ""}の比較`
    : names[0];
  const description = comparison
    ? `${resorts.length}件のスキー場のゲレンデ・料金・天気などを比較。航空写真に斜度を重ねたゲレンデマップで確認できます。`
    : `${names[0]}のゲレンデマップ・コースの斜度・リフト・料金・天気を確認できます。`;
  const page = new URL("/rusutsu", PUBLIC_ORIGIN);
  if (comparison)
    page.searchParams.set(COMPARE_PARAM, encodeCompareCodes(resorts));
  else page.pathname += `/${resorts[0].id}`;
  const image = new URL("/rusutsu/api/share-image", PUBLIC_ORIGIN);
  image.searchParams.set(
    "ids",
    resorts
      .slice(0, 4)
      .map(r => r.id)
      .join(","),
  );
  image.searchParams.set("count", String(resorts.length));
  if (comparison) image.searchParams.set("comparison", "1");
  // 素材はデータ内容でも版管理する。SNS向けURLは日ごとにも切り替える。
  image.searchParams.set(
    "v",
    `${SHARE_IMAGE_VERSION}-${new Date().toISOString().slice(0, 10)}`,
  );
  const imageInfo = {
    url: image.href,
    width: 1200,
    height: 630,
    alt: `${title}の航空写真・斜度マップ`,
  };
  return {
    title,
    description,
    alternates: { canonical: page.href },
    openGraph: {
      title: `${title} | Rusutsu`,
      description,
      url: page.href,
      siteName: "Rusutsu",
      locale: "ja_JP",
      type: "website",
      images: [imageInfo],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Rusutsu`,
      description,
      images: [imageInfo],
    },
  };
}
