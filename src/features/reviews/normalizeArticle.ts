import { REVIEW_CATEGORY_IDS, type ReviewArticleFile } from "./types";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const bullets = (value: unknown, label?: string) =>
  Array.isArray(value)
    ? value
        .map(record)
        .filter(row => !label || row.label === label)
        .map(row => text(row.text))
        .filter(Boolean)
        .join("\n")
    : text(value);

/** 表示用の変換だけを行う。DBに保存するJSONの配列や証拠は変更しない。 */
export function normalizeReviewArticle(raw: unknown): ReviewArticleFile {
  const article = record(raw);
  const categories = Object.fromEntries(
    REVIEW_CATEGORY_IDS.map(id => {
      const category = record(article[id]);
      return [
        id,
        {
          score: ["◎", "○", "△"].includes(text(category.score))
            ? category.score
            : null,
          good: Array.isArray(category.reason)
            ? bullets(category.reason, "good")
            : text(category.good),
          bad: Array.isArray(category.reason)
            ? bullets(category.reason, "bad")
            : text(category.bad),
          description: Array.isArray(category.reason)
            ? bullets(category.reason, "description")
            : "",
          courses: Array.isArray(category.courses)
            ? category.courses.map(record).map(course => ({
                name: text(course.name),
                description: text(course.description),
              }))
            : [],
        },
      ];
    }),
  );
  return {
    resortId: text(article.resortId),
    full: bullets(article.full),
    ...categories,
  } as ReviewArticleFile;
}

export function supportsReviewForm(detail: unknown, article: unknown): boolean {
  const d = record(detail);
  const a = record(article);
  return (
    typeof a.full === "string" &&
    REVIEW_CATEGORY_IDS.every(id => {
      const dc = record(d[id]);
      const ac = record(a[id]);
      return (
        Array.isArray(dc.good) &&
        Array.isArray(dc.bad) &&
        typeof ac.good === "string" &&
        typeof ac.bad === "string"
      );
    })
  );
}
