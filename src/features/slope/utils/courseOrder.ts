export const reorderItemsByNameOrder = <T>(
  items: T[],
  orderedNames: string[],
  getName: (item: T) => unknown,
): T[] => {
  const rankByName = new Map<string, number>();
  for (const name of orderedNames) {
    const normalized = name.trim();
    if (normalized && !rankByName.has(normalized)) {
      rankByName.set(normalized, rankByName.size);
    }
  }

  return items
    .map((item, index) => {
      const rawName = getName(item);
      const name = typeof rawName === "string" ? rawName.trim() : "";
      return { item, index, rank: rankByName.get(name) };
    })
    .sort((left, right) => {
      if (left.rank === undefined && right.rank === undefined) {
        return left.index - right.index;
      }
      if (left.rank === undefined) return 1;
      if (right.rank === undefined) return -1;
      return left.rank - right.rank || left.index - right.index;
    })
    .map(entry => entry.item);
};
