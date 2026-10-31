import type { CommunityMapData, PublicMapEntry } from "./contract";

export type CommunityPeriod = "3d" | "7d" | "season" | "all";
// 写真の枠・地点・表示項目ボタンで、同じ種類には同じ色を使う。
export const COMMUNITY_KIND_COLORS = {
  COURSE: "#0A7CFF",
  LIFT: "#00C26E",
  MOGUL: "#FF2E9A",
  ITEM: "#FF8A00",
} satisfies Record<PublicMapEntry["kind"], string>;

export type ResolvedMapEntry = {
  entry: PublicMapEntry;
  coordinates: [number, number];
  targetOnly: boolean;
};

export type MapEntryGroup = {
  key: string;
  coordinates: [number, number];
  posts: ResolvedMapEntry[];
};

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
    // シーズンは9月末で区切る（10月1日〜翌9月30日）
    const seasonYear = month >= 10 ? year : year - 1;
    return `${seasonYear}-10-01`;
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

/** 日本時間の今日（YYYY-MM-DD） */
export function todayInJapan(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function chooseCommunityPeriod(
  latestObservedOn: string | null,
  now = new Date(),
): CommunityPeriod {
  if (!latestObservedOn) return "all";
  if (latestObservedOn >= (getPeriodStart("7d", now) ?? "")) return "7d";
  if (latestObservedOn >= (getPeriodStart("season", now) ?? ""))
    return "season";
  return "all";
}

function validCoordinate(
  point: number[] | undefined,
): point is [number, number] {
  const longitude = point?.[0];
  const latitude = point?.[1];
  return (
    !!point &&
    point.length >= 2 &&
    typeof longitude === "number" &&
    typeof latitude === "number" &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function segmentLength(start: [number, number], end: [number, number]) {
  const meanLatitude = ((start[1] + end[1]) / 2) * (Math.PI / 180);
  const longitudeDistance = (end[0] - start[0]) * Math.cos(meanLatitude);
  const latitudeDistance = end[1] - start[1];
  return Math.hypot(longitudeDistance, latitudeDistance);
}

function lineLength(line: number[][]) {
  let length = 0;
  for (let index = 1; index < line.length; index++) {
    const previous = line[index - 1];
    const current = line[index];
    if (!validCoordinate(previous) || !validCoordinate(current)) return 0;
    length += segmentLength(previous, current);
  }
  return length;
}

function lineMidpoint(line: number[][]): [number, number] | null {
  if (line.length < 2 || !line.every(point => validCoordinate(point)))
    return null;
  const total = lineLength(line);
  if (total === 0) {
    const point = line[0];
    return validCoordinate(point) ? [point[0], point[1]] : null;
  }
  let remaining = total / 2;
  for (let index = 1; index < line.length; index++) {
    const start = line[index - 1];
    const end = line[index];
    if (!validCoordinate(start) || !validCoordinate(end)) return null;
    const length = segmentLength(start, end);
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ];
    }
    remaining -= length;
  }
  const last = line.at(-1);
  return validCoordinate(last) ? [last[0], last[1]] : null;
}

function targetCoordinates(
  entry: PublicMapEntry,
  data: Pick<CommunityMapData, "courses" | "lifts">,
): [number, number] | null {
  const collection = entry.kind === "COURSE" ? data.courses : data.lifts;
  const targetId = entry.kind === "COURSE" ? entry.courseId : entry.liftId;
  if (!targetId || (entry.kind !== "COURSE" && entry.kind !== "LIFT"))
    return null;
  const target = collection.find(item => item.id === targetId);
  if (!target) return null;
  const lines = target.lines.length ? target.lines : [target.coordinates];
  const longest = lines
    .filter(
      line => line.length >= 2 && line.every(point => validCoordinate(point)),
    )
    .sort((a, b) => lineLength(b) - lineLength(a))[0];
  return longest ? lineMidpoint(longest) : null;
}

export function resolveMapEntries(
  posts: PublicMapEntry[],
  data: Pick<CommunityMapData, "courses" | "lifts">,
): ResolvedMapEntry[] {
  const resolved: ResolvedMapEntry[] = [];
  for (const entry of posts) {
    if (entry.latitude != null || entry.longitude != null) {
      if (
        entry.latitude != null &&
        entry.longitude != null &&
        validCoordinate([entry.longitude, entry.latitude])
      ) {
        resolved.push({
          entry,
          coordinates: [entry.longitude, entry.latitude],
          targetOnly: false,
        });
      }
      continue;
    }
    const coordinates = targetCoordinates(entry, data);
    if (coordinates) resolved.push({ entry, coordinates, targetOnly: true });
  }
  return resolved;
}

function newestFirst(a: ResolvedMapEntry, b: ResolvedMapEntry) {
  return (
    b.entry.observedOn.localeCompare(a.entry.observedOn) ||
    b.entry.id.localeCompare(a.entry.id)
  );
}

function representative(posts: ResolvedMapEntry[]) {
  let chosen: ResolvedMapEntry | undefined;
  for (const post of posts) {
    const hasPreferredPhoto = post.entry.photo && !chosen?.entry.photo;
    const samePhotoStatus = !!post.entry.photo === !!chosen?.entry.photo;
    if (
      !chosen ||
      hasPreferredPhoto ||
      (samePhotoStatus && newestFirst(post, chosen) < 0)
    ) {
      chosen = post;
    }
  }
  if (!chosen)
    throw new Error("Cannot choose a representative from an empty group");
  return chosen;
}

export function groupMapEntries(
  entries: ResolvedMapEntry[],
  project: (coordinates: [number, number]) => { x: number; y: number },
  viewport: { width: number; height: number },
  cellSize = 48,
): MapEntryGroup[] {
  const margin = 100;
  const targetGroups = new Map<string, ResolvedMapEntry[]>();
  const points: ResolvedMapEntry[] = [];
  for (const item of entries) {
    const screen = project(item.coordinates);
    if (
      !Number.isFinite(screen.x) ||
      !Number.isFinite(screen.y) ||
      screen.x < -margin ||
      screen.x > viewport.width + margin ||
      screen.y < -margin ||
      screen.y > viewport.height + margin
    )
      continue;
    if (item.targetOnly) {
      const id =
        item.entry.kind === "COURSE"
          ? item.entry.courseId
          : item.entry.kind === "LIFT"
            ? item.entry.liftId
            : null;
      if (id) {
        const key = `${item.entry.kind}:${id}`;
        const targetGroup = targetGroups.get(key);
        if (targetGroup) targetGroup.push(item);
        else targetGroups.set(key, [item]);
        continue;
      }
    }
    points.push(item);
  }

  const clusters: ResolvedMapEntry[][] = [
    ...targetGroups.values(),
    ...points.map(item => [item]),
  ];
  const clusterPoints = clusters.map(cluster => {
    const primary = representative(cluster);
    return { primary, screen: project(primary.coordinates) };
  });
  const parent = clusters.map((_, index) => index);
  const find = (index: number): number => {
    const current = parent[index];
    if (current == null) return index;
    if (current !== index) parent[index] = find(current);
    return parent[index] ?? index;
  };
  const size = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 48;
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < clusterPoints.length; index++) {
    const point = clusterPoints[index]?.screen;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      continue;
    const cellX = Math.floor(point.x / size);
    const cellY = Math.floor(point.y / size);
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const candidates = buckets.get(`${cellX + offsetX}:${cellY + offsetY}`);
        if (!candidates) continue;
        for (const candidate of candidates) {
          const candidatePoint = clusterPoints[candidate]?.screen;
          if (
            candidatePoint &&
            Math.hypot(
              point.x - candidatePoint.x,
              point.y - candidatePoint.y,
            ) <= size
          ) {
            const rootA = find(index);
            const rootB = find(candidate);
            if (rootA !== rootB) parent[rootB] = rootA;
          }
        }
      }
    }
    const bucketKey = `${cellX}:${cellY}`;
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(index);
    else buckets.set(bucketKey, [index]);
  }
  const merged = new Map<number, ResolvedMapEntry[]>();
  clusters.forEach((cluster, index) => {
    const root = find(index);
    merged.set(root, [...(merged.get(root) ?? []), ...cluster]);
  });

  return [...merged.values()].map(cluster => {
    const ordered = [...cluster].sort(newestFirst);
    const primary = representative(ordered);
    const ids = ordered.map(item => item.entry.id).sort();
    return {
      key: JSON.stringify(ids),
      coordinates: primary.coordinates,
      posts: ordered,
    };
  });
}
