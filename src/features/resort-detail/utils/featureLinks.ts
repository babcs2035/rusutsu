/**
 * コース・リフトの詳細から外部へ出るリンク周り。
 */

const YOUTUBE_SEARCH_URL = "https://www.youtube.com/results";

export const getYoutubeSearchUrl = (query: string) =>
  `${YOUTUBE_SEARCH_URL}?search_query=${encodeURIComponent(query)}`;

/**
 * 動画を探すときの検索語。
 *
 * 基本情報に searchWord があればそれを使う。無いスキー場もあるので、
 * その場合は「スキー場の省略名 + コース名」で組み立てる。
 */
export const getFeatureSearchWord = ({
  searchWord,
  resortLabelName,
  featureName,
}: {
  searchWord: string | null | undefined;
  resortLabelName: string;
  featureName: string;
}): string => {
  const trimmed = searchWord?.trim();
  if (trimmed) return trimmed;

  return [resortLabelName.trim(), featureName.trim()]
    .filter(part => part.length > 0)
    .join(" ");
};

/** 「2026-04-06 07:28 更新」→「更新日時: 2026-04-06 07:28」 */
export const formatUpdatedAt = (update: string | null | undefined) => {
  const trimmed = update?.trim();
  if (!trimmed) return null;

  const withoutSuffix = trimmed.replace(/\s*(更新|現在)\s*$/u, "").trim();
  return `更新日時: ${withoutSuffix.length > 0 ? withoutSuffix : trimmed}`;
};

/** 出典の表示名にホスト名を使う */
export const getSourceLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};
