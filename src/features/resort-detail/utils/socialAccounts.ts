import type { ResortLinks } from "@/features/lift/types";

export const SOCIAL_PLATFORMS = ["X", "Instagram", "Facebook"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialAccount = { url: string; label: string; handle: string };

const fields = {
  X: "xUrls",
  Instagram: "instagramUrls",
  Facebook: "facebookUrls",
} as const;

/**
 * Facebook のページプラグインは /people/名前/ID/ 形式を受け付けず空白になるため、
 * 数値IDで指す URL（/people/, /pages/, /p/名前-ID/, /名前-ID, profile.php?id=）は
 * profile.php?id=ID に揃える。名前があれば表示名の代わりに使う。
 */
function facebookAccount(url: URL): { canonical: string; handle: string } {
  const segments = url.pathname.split("/").filter(Boolean);
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  let id: string | null = null;
  let name: string | null = null;
  if (segments[0] === "profile.php") id = url.searchParams.get("id");
  else if (["people", "pages"].includes(segments[0]) && segments.length >= 3) {
    name = decode(segments[1]);
    id = segments[2];
  } else {
    // /p/名前-ID/ と、旧来の /名前-ID
    const slug = segments[0] === "p" ? segments[1] : segments[0];
    const match = slug ? /^(.*)-(\d+)$/.exec(decode(slug)) : null;
    if (match) [, name, id] = match;
  }
  if (id && /^\d+$/.test(id))
    return {
      canonical: `https://www.facebook.com/profile.php?id=${id}`,
      handle: name || id,
    };
  return {
    canonical: `https://www.facebook.com/${segments.join("/")}`,
    handle: segments[0] ?? "",
  };
}

export function collectSocialAccounts(
  links: Record<string, ResortLinks>,
  resortIds: string[],
): Record<SocialPlatform, SocialAccount[]> {
  const result: Record<SocialPlatform, SocialAccount[]> = {
    X: [],
    Instagram: [],
    Facebook: [],
  };
  for (const platform of SOCIAL_PLATFORMS) {
    const seen = new Set<string>();
    for (const id of new Set(resortIds)) {
      for (const link of links[id]?.[fields[platform]] ?? []) {
        try {
          const url = new URL(link.url);
          if (!["https:", "http:"].includes(url.protocol)) continue;
          const host = url.hostname.replace(/^(www|m|mobile)\./, "");
          const domains =
            platform === "X"
              ? ["x.com", "twitter.com"]
              : platform === "Instagram"
                ? ["instagram.com"]
                : ["facebook.com", "fb.com"];
          if (!domains.includes(host)) continue;
          const facebook =
            platform === "Facebook" ? facebookAccount(url) : null;
          const handle =
            facebook?.handle ?? url.pathname.split("/").filter(Boolean)[0];
          if (!handle) continue;
          if (platform === "X" && !/^[a-zA-Z0-9_]{1,15}$/.test(handle))
            continue;
          const canonical =
            platform === "X"
              ? `https://x.com/${handle}`
              : platform === "Instagram"
                ? `https://www.instagram.com/${handle}/`
                : (facebook?.canonical ?? "");
          if (seen.has(canonical.toLowerCase())) continue;
          seen.add(canonical.toLowerCase());
          result[platform].push({
            url: canonical,
            handle,
            label:
              link.description ||
              (platform === "Facebook" ? handle : `@${handle}`),
          });
        } catch {
          // Invalid stored URLs must not prevent the resort detail from opening.
        }
      }
    }
  }
  return result;
}

/** 同時表示で、組のスキー場のアカウントを並べる（同じアカウントは1つにする） */
export function mergeSocialAccounts(
  groups: Array<Partial<Record<SocialPlatform, SocialAccount[]>> | null>,
): Record<SocialPlatform, SocialAccount[]> {
  const result: Record<SocialPlatform, SocialAccount[]> = {
    X: [],
    Instagram: [],
    Facebook: [],
  };
  for (const platform of SOCIAL_PLATFORMS) {
    const seen = new Set<string>();
    for (const account of groups.flatMap(group => group?.[platform] ?? [])) {
      if (seen.has(account.url.toLowerCase())) continue;
      seen.add(account.url.toLowerCase());
      result[platform].push(account);
    }
  }
  return result;
}
