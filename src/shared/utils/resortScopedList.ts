type ResortScoped = { skiId: string };

/**
 * 編集中スキー場に所属する要素だけへ updater を適用し、所属確認で別スキー場へ
 * 移した要素は位置ごとそのまま残す。更新後の要素は元の所属要素の位置へ順に戻し、
 * 増えた分は最後の所属要素の直後へ挿入する。
 */
export function updateResortScopedList<T extends ResortScoped>(
  items: T[],
  resortId: string,
  updater: (scoped: T[]) => T[],
): T[] {
  const scoped = items.filter(item => item.skiId === resortId);
  const next = updater(scoped);
  if (next === scoped) return items;

  const result: T[] = [];
  let nextIndex = 0;
  let lastScopedPosition = -1;
  for (const item of items) {
    if (item.skiId !== resortId) {
      result.push(item);
      continue;
    }
    if (nextIndex < next.length) {
      result.push(next[nextIndex++]);
      lastScopedPosition = result.length - 1;
    }
  }
  const rest = next.slice(nextIndex);
  if (rest.length > 0) result.splice(lastScopedPosition + 1, 0, ...rest);
  return result;
}
