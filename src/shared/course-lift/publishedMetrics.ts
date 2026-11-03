/** Retired course attributes. Map-derived metrics and lift attributes are separate. */
export const PUBLISHED_COURSE_METRIC_KEYS = ["distance", "avg", "max"] as const;

export function omitPublishedCourseMetrics<T extends Record<string, unknown>>(
  properties: T,
): Omit<T, (typeof PUBLISHED_COURSE_METRIC_KEYS)[number]> {
  const copy = { ...properties };
  for (const key of PUBLISHED_COURSE_METRIC_KEYS) delete copy[key];
  return copy;
}
