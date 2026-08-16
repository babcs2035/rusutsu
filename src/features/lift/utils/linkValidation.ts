import { RESORT_LINK_KEYS, RESORT_LINK_LABELS } from "../constants";
import type { EditorLift, ResortLinks } from "../types";
import { liftDisplayName } from "./liftOps";

const SOCIAL_LINK_RULES = [
  {
    key: "xUrls",
    label: "X",
    domains: ["x.com", "twitter.com"],
  },
  {
    key: "instagramUrls",
    label: "Instagram",
    domains: ["instagram.com"],
  },
  {
    key: "youtubeUrls",
    label: "YouTube",
    domains: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  },
] as const;

const parseHttpUrl = (value: string): URL | null => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const isDomainOrSubdomain = (hostname: string, domain: string): boolean =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const hasYouTubeStartTime = (url: URL): boolean => {
  const timeKeys = new Set(["t", "start", "time_continue"]);
  for (const key of url.searchParams.keys()) {
    if (timeKeys.has(key.toLowerCase())) return true;
  }

  const fragment = url.hash.replace(/^#/, "");
  if (fragment === "") return false;
  const fragmentParams = new URLSearchParams(fragment);
  for (const key of fragmentParams.keys()) {
    if (timeKeys.has(key.toLowerCase())) return true;
  }
  return /(?:^|[?&#])(t|start|time_continue)=/i.test(fragment);
};

type LinkOccurrence = {
  resortId: string;
  url: string;
  source: string;
};

const collectLinkOccurrences = (
  resortId: string,
  links: ResortLinks,
  lifts: EditorLift[],
): LinkOccurrence[] => {
  const occurrences: LinkOccurrence[] = [];
  for (const key of RESORT_LINK_KEYS) {
    (links[key] ?? []).forEach((link, index) => {
      const url = link.url.trim();
      if (url === "") return;
      occurrences.push({
        resortId,
        url,
        source: `${RESORT_LINK_LABELS[key]} ${index + 1}`,
      });
    });
  }
  lifts.forEach((lift, index) => {
    const url = lift.detail.link.trim();
    if (url === "") return;
    occurrences.push({
      resortId: lift.skiId,
      url,
      source: `リフト「${liftDisplayName(lift, index)}」のリンク`,
    });
  });
  return occurrences;
};

export const validateResortLinks = (
  resortId: string,
  links: ResortLinks,
  lifts: EditorLift[],
): string[] => {
  const warnings: string[] = [];

  for (const rule of SOCIAL_LINK_RULES) {
    (links[rule.key] ?? []).forEach((link, index) => {
      const value = link.url.trim();
      if (value === "") return;
      const parsed = parseHttpUrl(value);
      const fieldLabel = `${rule.label} ${index + 1}`;
      if (
        !parsed ||
        !rule.domains.some(domain =>
          isDomainOrSubdomain(parsed.hostname.toLowerCase(), domain),
        )
      ) {
        warnings.push(
          `${fieldLabel} は ${rule.label} のURLではない可能性があります: ${value}`,
        );
        return;
      }
      if (rule.key === "youtubeUrls" && hasYouTubeStartTime(parsed)) {
        warnings.push(
          `${fieldLabel} に再生開始時刻（t / start / time_continue）が含まれています。開始時刻を外してください: ${value}`,
        );
      }
    });
  }

  const occurrencesByResortAndUrl = new Map<string, LinkOccurrence[]>();
  for (const occurrence of collectLinkOccurrences(resortId, links, lifts)) {
    const key = `${occurrence.resortId}\n${occurrence.url}`;
    const current = occurrencesByResortAndUrl.get(key) ?? [];
    current.push(occurrence);
    occurrencesByResortAndUrl.set(key, current);
  }
  for (const occurrences of occurrencesByResortAndUrl.values()) {
    if (occurrences.length < 2) continue;
    warnings.push(
      `スキー場「${occurrences[0].resortId}」内で同じURLが重複しています（${occurrences.map(item => item.source).join("、")}）: ${occurrences[0].url}`,
    );
  }

  return warnings;
};
