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
  /** statuses と同じ並びのスキー場名。同名の項目を区別するのに使う */
  labels: Array<string | null | undefined> = [],
): LatestSuccessfulStatus | null {
  const labeled = labelDuplicateNames(statuses, labels);
  const available = labeled.filter(
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

const itemName = (item: LatestSuccessfulStatus["items"][number]) =>
  typeof item.name === "string" ? item.name.trim() : "";

/**
 * 複数のスキー場に同じ名前のコース・リフトがあると、名前だけでは区別できない。
 * その名前に限り「スキー場名 コース名」にする。
 */
function labelDuplicateNames(
  statuses: Array<LatestSuccessfulStatus | null>,
  labels: Array<string | null | undefined>,
): Array<LatestSuccessfulStatus | null> {
  const owners = new Map<string, Set<number>>();
  statuses.forEach((status, index) => {
    for (const item of status?.items ?? []) {
      const name = itemName(item);
      if (name) owners.set(name, (owners.get(name) ?? new Set()).add(index));
    }
  });
  return statuses.map((status, index) => {
    const label = labels[index]?.trim();
    if (!status || !label) return status;
    const items = status.items.map(item => {
      const name = itemName(item);
      return (owners.get(name)?.size ?? 0) > 1
        ? { ...item, name: `${label} ${name}` }
        : item;
    });
    return items.some((item, i) => item !== status.items[i])
      ? { ...status, items }
      : status;
  });
}

/**
 * 連携エリアの名称対応用。採用済みの結果がないスキー場も、履歴の最新を使って
 * 名前を出す。履歴の各パターンにも他スキー場の名前を足し、どれを選んでも
 * 片方のスキー場だけにならないようにする。
 */
export function combineLinkedMappingCaptures(
  members: Array<{
    label?: string | null;
    status: LatestSuccessfulStatus | null;
    history: LatestSuccessfulStatus[];
  }>,
): {
  status: LatestSuccessfulStatus | null;
  history: LatestSuccessfulStatus[];
} {
  const representatives = members.map(
    member => member.status ?? member.history[0] ?? null,
  );
  return {
    status: combineLatestStatuses(
      representatives,
      members.map(member => member.label),
    ),
    history: members.flatMap((member, index) =>
      member.history.map(capture => {
        const others = members.flatMap((_, otherIndex) =>
          otherIndex === index ? [] : [otherIndex],
        );
        const combined = combineLatestStatuses(
          [capture, ...others.map(other => representatives[other])],
          [member.label, ...others.map(other => members[other].label)],
        );
        // パターンの識別と保存時の照合には、元の取得結果のファイル名を使う
        return combined && combined !== capture
          ? {
              ...combined,
              fileName: capture.fileName,
              time: capture.time,
              archiveTimestamp: capture.archiveTimestamp ?? null,
            }
          : capture;
      }),
    ),
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
