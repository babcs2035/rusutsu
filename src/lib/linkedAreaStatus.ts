import type { LatestSuccessfulStatus } from "@/lib/latestStatusFiles";

const timeOf = (status: LatestSuccessfulStatus) => {
  const time = status.time ? Date.parse(status.time) : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/**
 * 連携エリアの親は自前のクローラーを持たないので、所属スキー場の取得結果を
 * 1つにまとめる。観測時刻は最も新しいもの、出典は全スキー場分を使う。
 */
export function combineLatestStatuses(
  statuses: Array<LatestSuccessfulStatus | null>,
): LatestSuccessfulStatus | null {
  const available = statuses.filter(
    (status): status is LatestSuccessfulStatus => status !== null,
  );
  if (available.length <= 1) return available[0] ?? null;
  const latest = available.reduce((current, status) =>
    timeOf(status) > timeOf(current) ? status : current,
  );
  return {
    fileName: latest.fileName,
    time: latest.time,
    archiveTimestamp:
      available.find(status => status.archiveTimestamp)?.archiveTimestamp ??
      null,
    items: available.flatMap(status => status.items),
    sourceUrls: [...new Set(available.flatMap(status => status.sourceUrls))],
  };
}

/** 所属スキー場のどれかに取得結果があれば、親も取得済みとして扱う。 */
export function withLinkedAreaIds(
  resortIds: string[],
  areas: Array<{ id: string; memberIds: string[] }>,
): string[] {
  const covered = new Set(resortIds);
  return [
    ...resortIds,
    ...areas
      .filter(
        area =>
          !covered.has(area.id) &&
          area.memberIds.some(memberId => covered.has(memberId)),
      )
      .map(area => area.id),
  ];
}
