import { z } from "zod";
import {
  RESORT_LINK_KEYS,
  RESORT_LINK_LABELS,
} from "@/features/lift/constants";
import type { ResortLink, ResortLinks } from "@/features/lift/types";

export type LinkKey = keyof ResortLinks;

// Only genuine SNS / platform links are restricted to their official domain.
// Everything else (official site, map, school, etc.) just needs a valid
// http(s) URL — there is no fixed host to check against.
const LINK_DOMAINS: Partial<Record<LinkKey, readonly string[]>> = {
  xUrls: ["x.com", "twitter.com"],
  instagramUrls: ["instagram.com"],
  facebookUrls: ["facebook.com", "fb.com"],
  youtubeUrls: ["youtube.com", "youtu.be"],
  threadsUrls: ["threads.net", "threads.com"],
  lineUrls: ["line.me", "lin.ee"],
};

export const LINK_CATEGORIES = RESORT_LINK_KEYS.map(key => ({
  key,
  label: RESORT_LINK_LABELS[key],
  domains: LINK_DOMAINS[key],
}));

export type LinkResort = {
  id: string;
  name: string;
  prefecture: string;
  searchName: string;
};
export type LinksMap = Record<string, Partial<Record<LinkKey, ResortLink[]>>>;

const linkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(2000).optional(),
});
export const linkSaveSchema = z
  .object({
    resortId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/)
      .max(200),
    platform: z.enum(RESORT_LINK_KEYS as [LinkKey, ...LinkKey[]]),
    links: z.array(linkSchema).max(50),
    // Existing legacy URLs must remain usable as the comparison baseline.
    expectedLinks: z.array(linkSchema).max(100),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>();
    for (const [index, link] of request.links.entries()) {
      if (!isValidLinkUrl(request.platform, link.url)) {
        context.addIssue({
          code: "custom",
          message: `${index + 1}件目: この項目に登録できる http / https URLを入力してください。`,
          path: ["links", index, "url"],
        });
      }
      const identity = linkUrlIdentity(link.url);
      if (seen.has(identity))
        context.addIssue({
          code: "custom",
          message: `${index + 1}件目: 同じURLが重複しています。`,
          path: ["links", index, "url"],
        });
      seen.add(identity);
    }
  });
export type LinkSaveRequest = z.infer<typeof linkSaveSchema>;
export type LinkSaveResult =
  | { ok: true; links: ResortLink[] }
  | { ok: false; message: string };

export function isValidLinkUrl(platform: LinkKey, value: string): boolean {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return false;
    const domains = LINK_DOMAINS[platform];
    if (!domains) return true;
    return domains.some(
      domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function linkUrlIdentity(value: string): string {
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

// Instagram (and some other apps') "share" links append a one-time tracking
// token as ?stkn=... . It is never part of the account/post identity, so
// strip it whenever a link is normalized (both on save and on read).
const TRACKING_ONLY_PARAMS = ["stkn"];

export function stripTrackingParams(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  let changed = false;
  for (const key of TRACKING_ONLY_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return value;
  const query = url.searchParams.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function normalizeLinkList(value: unknown): ResortLink[] {
  if (!Array.isArray(value)) throw new Error("リンクの保存形式が不正です。");
  return value.map(item => {
    const parsed = linkSchema.parse(
      typeof item === "string" ? { url: item } : item,
    );
    return {
      url: stripTrackingParams(parsed.url),
      ...(parsed.description ? { description: parsed.description } : {}),
    };
  });
}

export function parseLinksDocument(
  content: string | null,
): Record<string, Record<string, unknown>> {
  return z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .parse(content === null ? {} : JSON.parse(content));
}

export function linksFromDocument(content: string | null): LinksMap {
  return Object.fromEntries(
    Object.entries(parseLinksDocument(content)).map(([id, entry]) => [
      id,
      Object.fromEntries(
        RESORT_LINK_KEYS.map(key => [key, normalizeLinkList(entry[key] ?? [])]),
      ),
    ]),
  );
}

// Patch one field only, preserving all other resorts, fields and legacy values.
export function patchLinksDocument(
  content: string | null,
  request: LinkSaveRequest,
): string {
  const map = parseLinksDocument(content);
  const current = normalizeLinkList(
    map[request.resortId]?.[request.platform] ?? [],
  );
  if (
    JSON.stringify(current) !==
    JSON.stringify(normalizeLinkList(request.expectedLinks))
  )
    throw new Error(
      "この項目は別の操作で更新されました。入力内容を控えてから再読み込みしてください。",
    );
  map[request.resortId] = {
    ...map[request.resortId],
    [request.platform]: normalizeLinkList(request.links),
  };
  return `${JSON.stringify(map, null, 2)}\n`;
}
