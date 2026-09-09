import { z } from "zod";
import type { ResortLink } from "@/features/lift/types";

export const SOCIAL_PLATFORMS = [
  { key: "xUrls", label: "X", domains: ["x.com", "twitter.com"] },
  { key: "instagramUrls", label: "Instagram", domains: ["instagram.com"] },
  {
    key: "facebookUrls",
    label: "Facebook",
    domains: ["facebook.com", "fb.com"],
  },
  {
    key: "youtubeUrls",
    label: "YouTube",
    domains: ["youtube.com", "youtu.be"],
  },
  {
    key: "threadsUrls",
    label: "Threads",
    domains: ["threads.net", "threads.com"],
  },
  { key: "lineUrls", label: "LINE", domains: ["line.me", "lin.ee"] },
] as const;
export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]["key"];
export type SocialResort = {
  id: string;
  name: string;
  prefecture: string;
  searchName: string;
};
export type SocialLinksMap = Record<
  string,
  Partial<Record<SocialKey, ResortLink[]>>
>;

const linkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(2000).optional(),
});
export const socialSaveSchema = z
  .object({
    resortId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/)
      .max(200),
    platform: z.enum([
      "xUrls",
      "instagramUrls",
      "facebookUrls",
      "youtubeUrls",
      "threadsUrls",
      "lineUrls",
    ]),
    links: z.array(linkSchema).max(50),
    // Existing legacy URLs must remain usable as the comparison baseline.
    expectedLinks: z.array(linkSchema).max(100),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>();
    for (const [index, link] of request.links.entries()) {
      if (!isSocialUrl(request.platform, link.url)) {
        context.addIssue({
          code: "custom",
          message: `${index + 1}件目: 選択したSNSの http / https URLを入力してください。`,
          path: ["links", index, "url"],
        });
      }
      const identity = socialUrlIdentity(link.url);
      if (seen.has(identity))
        context.addIssue({
          code: "custom",
          message: `${index + 1}件目: 同じURLが重複しています。`,
          path: ["links", index, "url"],
        });
      seen.add(identity);
    }
  });
export type SocialSaveRequest = z.infer<typeof socialSaveSchema>;
export type SocialSaveResult =
  | { ok: true; links: ResortLink[] }
  | { ok: false; message: string };

export function isSocialUrl(platform: SocialKey, value: string): boolean {
  try {
    const url = new URL(value);
    const rule = SOCIAL_PLATFORMS.find(item => item.key === platform);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !!rule?.domains.some(
        domain =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

export function socialUrlIdentity(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^twitter\.com$/, "x.com")
      .replace(/^threads\.net$/, "threads.com");
    let pathname = url.pathname.replace(/\/+$/, "");
    if (
      ["x.com", "instagram.com", "threads.com", "facebook.com"].includes(host)
    )
      pathname = pathname.toLowerCase();
    if (host === "facebook.com")
      pathname = pathname.replace(/^\/pg\//, "/").replace(/\/posts$/, "");
    for (const key of [...url.searchParams.keys()]) {
      if (
        ["s", "t", "hl", "igshid", "igsh", "fbclid"].includes(key) ||
        key.startsWith("utm_")
      )
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return `${host}${pathname}${url.search}`;
  } catch {
    return value.trim();
  }
}

export function normalizeSocialLinks(value: unknown): ResortLink[] {
  if (!Array.isArray(value)) throw new Error("SNSリンクの保存形式が不正です。");
  return value.map(item => {
    const parsed = linkSchema.parse(
      typeof item === "string" ? { url: item } : item,
    );
    return {
      url: parsed.url,
      ...(parsed.description ? { description: parsed.description } : {}),
    };
  });
}

export function parseSocialDocument(
  content: string | null,
): Record<string, Record<string, unknown>> {
  return z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .parse(content === null ? {} : JSON.parse(content));
}

export function socialLinksFromDocument(
  content: string | null,
): SocialLinksMap {
  return Object.fromEntries(
    Object.entries(parseSocialDocument(content)).map(([id, entry]) => [
      id,
      Object.fromEntries(
        SOCIAL_PLATFORMS.map(({ key }) => [
          key,
          normalizeSocialLinks(entry[key] ?? []),
        ]),
      ),
    ]),
  );
}

// Patch one field only, preserving all other resorts, fields and legacy values.
export function patchSocialDocument(
  content: string | null,
  request: SocialSaveRequest,
): string {
  const map = parseSocialDocument(content);
  const current = normalizeSocialLinks(
    map[request.resortId]?.[request.platform] ?? [],
  );
  if (
    JSON.stringify(current) !==
    JSON.stringify(normalizeSocialLinks(request.expectedLinks))
  )
    throw new Error(
      "このSNS欄は別の操作で更新されました。入力内容を控えてから再読み込みしてください。",
    );
  map[request.resortId] = {
    ...map[request.resortId],
    [request.platform]: normalizeSocialLinks(request.links),
  };
  return `${JSON.stringify(map, null, 2)}\n`;
}
