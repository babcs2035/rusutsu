/**
 * クロールで集めた外部サイトの画像 URL の扱い。
 *
 * コース画像はスキー場ごとの公式サイト上にあり、ホスト名は
 * スキー場を追加するたびに増える（現時点で 14 ホスト）。
 * next.config.js の `images.remotePatterns` では列挙しきれないため、
 * この種の画像は `unoptimized` で直接読み込む。
 *
 * remotePatterns に載っていないホストを最適化つきで読み込むと、
 * 開発時は `Invalid src prop ... is not configured under images` で
 * ランタイムエラーになり、本番では画像最適化 API が 400 を返して
 * 画像が表示されない。
 */

/**
 * next/image の src として安全に渡せる外部 URL を返す。
 * 空文字・相対パス・http(s) 以外のスキームは null にして描画自体を止める。
 */
export const getExternalImageUrl = (
  value: string | null | undefined,
): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
};
