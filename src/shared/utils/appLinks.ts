/**
 * スマホでアプリを開かせたい外部サイトのリンク。
 * Windy には専用のURL（windy:// など）が無く、https のURLがそのままアプリを開く入口になっている。
 * iPhone は新しいタブで開くとアプリが開かないことがあるので同じタブで開き、
 * Android はアプリを名指しする intent:// にして、入っていなければ https のページへ戻す。
 */

export type MobilePlatform = "ios" | "android" | "other";

const APP_LINK_SITES = [
  {
    hosts: ["www.windy.com", "windy.com"],
    androidPackage: "com.windyty.android",
  },
];

export const detectMobilePlatform = (
  userAgent: string,
  maxTouchPoints = 0,
): MobilePlatform => {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS の Safari は Mac と同じ名乗りをするので、タッチ対応で見分ける
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
};

const findAppLinkSite = (url: URL) =>
  APP_LINK_SITES.find(site => site.hosts.includes(url.hostname));

/** アプリを開かせたいリンクなら、端末に合わせたURLと開き方を返す。対象外なら null */
export const getAppLink = (
  href: string,
  platform: MobilePlatform,
): { href: string; target: "_self" } | null => {
  if (platform === "other") return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const site = findAppLinkSite(url);
  if (!site) return null;

  if (platform === "ios") return { href, target: "_self" };

  const intent = [
    "Intent",
    "scheme=https",
    `package=${site.androidPackage}`,
    `S.browser_fallback_url=${encodeURIComponent(href)}`,
    "end",
  ].join(";");
  return {
    href: `intent://${url.host}${url.pathname}${url.search}#${intent}`,
    target: "_self",
  };
};
