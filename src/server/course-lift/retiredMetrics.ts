import { omitPublishedCourseMetrics } from "@/shared/course-lift/publishedMetrics";
import { mapDocumentKind, record } from "./canonicalCodec";

/** Strip retired attributes even from old clients and pre-relational imports. */
export function cleanCourseDocumentContent(
  key: string,
  content: string,
): string {
  const kind = mapDocumentKind(key);
  if (kind?.kind !== "course" || kind.mapping) return content;
  const data = JSON.parse(content);
  const cleaned = kind.detail
    ? data.map((entry: unknown) => omitPublishedCourseMetrics(record(entry)))
    : {
        ...data,
        features: data.features.map((feature: unknown) => {
          const item = record(feature);
          return item.properties
            ? {
                ...item,
                properties: omitPublishedCourseMetrics(record(item.properties)),
              }
            : item;
        }),
      };
  return JSON.stringify(data) === JSON.stringify(cleaned)
    ? content
    : `${JSON.stringify(cleaned, null, 2)}\n`;
}
