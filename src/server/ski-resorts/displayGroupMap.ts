import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";

type MapSection = {
  source: string;
  baseSource: string | null;
  observedAt?: string | null;
  sourceUrls: string[];
  verificationStatus?: "verified" | "unverified" | "mixed";
  features: unknown[];
};

const latestTime = (times: Array<string | null | undefined>) =>
  times.reduce<string | null>(
    (latest, time) => (time && (!latest || time > latest) ? time : latest),
    null,
  );

const combineSections = <S extends MapSection>(
  sections: Array<S | null | undefined>,
): S | null => {
  const present = sections.filter((section): section is S => Boolean(section));
  const [first] = present;
  if (!first) return null;
  if (present.length === 1) return first;
  const same = <K extends keyof S>(key: K) =>
    present.every(section => section[key] === first[key])
      ? first[key]
      : ("mixed" as S[K]);
  return {
    ...first,
    source: same("source"),
    baseSource: same("baseSource"),
    verificationStatus: same("verificationStatus"),
    observedAt: latestTime(present.map(section => section.observedAt)),
    sourceUrls: [...new Set(present.flatMap(section => section.sourceUrls))],
    features: present.flatMap(section => section.features),
  };
};

/**
 * 地図の同時表示グループの地図を1つにまとめる。線はそのまま並べ、
 * 公式の営業状況の件数は各スキー場の値を足し合わせる。
 */
export function combineResortMaps(
  maps: Array<FinalizedResortMapData | null>,
): FinalizedResortMapData | null {
  const present = maps.filter(
    (map): map is FinalizedResortMapData => map !== null,
  );
  if (!present.length) return null;
  const summaries = present.flatMap(map =>
    map.courseStatusSummary ? [map.courseStatusSummary] : [],
  );
  const [firstSummary] = summaries;
  return {
    courses: combineSections(present.map(map => map.courses)),
    lifts: combineSections(present.map(map => map.lifts)),
    courseStatusSummary: firstSummary
      ? {
          ...firstSummary,
          total: summaries.reduce((sum, item) => sum + item.total, 0),
          open: summaries.reduce((sum, item) => sum + item.open, 0),
          partial: summaries.reduce((sum, item) => sum + item.partial, 0),
          closed: summaries.reduce((sum, item) => sum + item.closed, 0),
          unknown: summaries.reduce((sum, item) => sum + item.unknown, 0),
          observedAt: latestTime(summaries.map(item => item.observedAt)),
          sourceUrls: [...new Set(summaries.flatMap(item => item.sourceUrls))],
          sourceLabels: Object.assign(
            {},
            ...summaries.map(item => item.sourceLabels ?? {}),
          ),
          updates: [...new Set(summaries.flatMap(item => item.updates))],
        }
      : null,
  };
}
