import type { ResortLinks } from "@/features/lift/types";

export const SOCIAL_PLATFORMS = ["X", "Instagram", "Facebook"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialAccount = { url: string; label: string; handle: string };

const fields = {
  X: "xUrls",
  Instagram: "instagramUrls",
  Facebook: "facebookUrls",
} as const;

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
          const handle = url.pathname.split("/").filter(Boolean)[0] ?? "";
          if (!handle) continue;
          if (platform === "X" && !/^[a-zA-Z0-9_]{1,15}$/.test(handle))
            continue;
          const canonical =
            platform === "X"
              ? `https://x.com/${handle}`
              : platform === "Instagram"
                ? `https://www.instagram.com/${handle}/`
                : `https://www.facebook.com${url.pathname}${url.pathname === "/profile.php" ? url.search : ""}`;
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
