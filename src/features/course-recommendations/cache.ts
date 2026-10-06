import type { SelectedMapFeature } from "@/features/map/types";
import type { RecommendationIndexResult } from "./actions";

/** Memory only; the provider creates a new cache for every account/favorite set. */
export function createResultCache<T>(
  load: (id: string) => Promise<T>,
  now = Date.now,
) {
  const entries = new Map<
    string,
    { promise: Promise<T>; value?: T; expires: number }
  >();
  const peek = (id: string) => {
    const entry = entries.get(id);
    return entry && entry.expires > now() ? entry.value : undefined;
  };
  const get = (id: string) => {
    const previous = entries.get(id);
    if (previous && previous.expires > now()) return previous.promise;
    if (entries.size >= 20)
      entries.delete(entries.keys().next().value as string);
    const entry: { promise: Promise<T>; value?: T; expires: number } = {
      promise: Promise.resolve().then(() => load(id)),
      expires: Number.POSITIVE_INFINITY,
    };
    entries.set(id, entry);
    entry.promise = entry.promise
      .then(value => {
        entry.value = value;
        entry.expires = now() + 60000;
        return value;
      })
      .catch(error => {
        if (entries.get(id) === entry) entries.delete(id);
        throw error;
      });
    return entry.promise;
  };
  return { get, peek, invalidate: (id: string) => entries.delete(id) };
}

export function selectCachedRecommendations(
  index: RecommendationIndexResult,
  selected: SelectedMapFeature,
) {
  if (index.status !== "ready")
    return { status: index.status, recommendations: [] };
  const source = index.courses.find(
    c =>
      selected.kind === "course" &&
      (selected.routeId
        ? c.routeKey === selected.routeId
        : c.groupId === selected.id || c.courseIds.includes(selected.id)),
  );
  if (
    !source ||
    (selected.kind === "course" &&
      !selected.routeId &&
      source.routeKey &&
      source.groupId === selected.id)
  )
    return { status: "source_unavailable" as const, recommendations: [] };
  return {
    status: source.recommendations.length
      ? ("ready" as const)
      : ("no_match" as const),
    recommendations: source.recommendations,
  };
}
