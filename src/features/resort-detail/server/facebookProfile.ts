export type FacebookProfile = { name: string; followers: string | null };

/** collectSocialAccounts が作る正規化済み URL だけを受け付ける */
export const isFacebookPageUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.facebook.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
};

const decodeEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** ページプラグイン（ヘッダーのみ）の HTML から、ページ名とフォロワー数を読む */
export function parseFacebookProfile(html: string): FacebookProfile | null {
  // ページ名は、ページへのリンク（?ref=embed_page）の title 属性にある
  const anchors =
    /<a\b[^>]*\bhref="https:\/\/www\.facebook\.com\/[^"]*ref=embed_page[^"]*"[^>]*>/gi;
  const name = [...html.matchAll(anchors)]
    .map(match => /\btitle="([^"]+)"/i.exec(match[0])?.[1])
    .find(Boolean);
  if (!name) return null;
  const decoded = decodeEntities(name).trim();
  if (!decoded || decoded.length > 200) return null;
  // 表記は「766 フォロワー」「フォロワー2,739人」のどちらもある
  const count =
    /([\d,]+)\s*フォロワー/.exec(html)?.[1] ??
    /フォロワー\s*([\d,]+)\s*人/.exec(html)?.[1] ??
    null;
  return { name: decoded, followers: count ? `フォロワー${count}人` : null };
}

export async function fetchFacebookProfile(
  pageUrl: string,
): Promise<FacebookProfile | null> {
  if (!isFacebookPageUrl(pageUrl)) return null;
  const params = new URLSearchParams({
    href: pageUrl,
    tabs: "",
    small_header: "true",
    hide_cover: "true",
    show_facepile: "false",
    locale: "ja_JP",
  });
  try {
    const response = await fetch(
      `https://www.facebook.com/plugins/page.php?${params}`,
      {
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "text/html", "Accept-Language": "ja" },
      },
    );
    if (!response.ok) return null;
    return parseFacebookProfile(await response.text());
  } catch {
    return null;
  }
}
