import type { ResortLink, ResortLinks } from "@/features/lift/types";

export type TrailMapLinks = {
  /** ゲレンデマップ本体（画像・PDF）のURL */
  mapUrls: ResortLink[];
  /** そのゲレンデマップが掲載されている公式サイトのページURL */
  mapPageUrls: ResortLink[];
};

const dedupe = (links: ResortLink[]) => {
  const seen = new Set<string>();
  const result: ResortLink[] = [];
  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    result.push(link);
  }
  return result;
};

/** 名寄せ元のIDもまとめて、スキー場のゲレンデマップ関連リンクを集める */
export function collectTrailMapLinks(
  links: Record<string, ResortLinks>,
  resortIds: string[],
): TrailMapLinks {
  const ids = [...new Set(resortIds)];
  return {
    mapUrls: dedupe(ids.flatMap(id => links[id]?.mapUrls ?? [])),
    mapPageUrls: dedupe(ids.flatMap(id => links[id]?.mapPageUrls ?? [])),
  };
}
