import type { PublicMapEntry } from "./contract";

export type CommunityPeriod = "3d" | "7d" | "season" | "all";

export function getPeriodStart(
  period: CommunityPeriod,
  now = new Date(),
): string | undefined {
  if (period === "all") return undefined;
  if (period === "season") {
    const year = Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
      }).format(now),
    );
    const month = Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        month: "2-digit",
      }).format(now),
    );
    const seasonYear = month >= 7 ? year : year - 1;
    return `${seasonYear}-07-01`;
  }
  const japanDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = japanDate.split("-").map(Number);
  const start = new Date(
    Date.UTC(year, month - 1, day - (period === "3d" ? 2 : 6)),
  );
  return start.toISOString().slice(0, 10);
}

export function groupExactCoordinates(posts: PublicMapEntry[]) {
  const groups = new Map<string, PublicMapEntry[]>();
  for (const post of posts) {
    if (post.latitude == null || post.longitude == null) continue;
    const key = `${post.longitude},${post.latitude}`;
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    coordinates: [items[0].longitude ?? 0, items[0].latitude ?? 0] as [
      number,
      number,
    ],
    posts: items,
  }));
}
