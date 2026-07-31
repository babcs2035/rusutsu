export const REVIEW_CATEGORY_IDS = [
  "beginner",
  "intermediate",
  "advanced",
  "moguls",
  "powder",
  "tree-run",
  "park",
] as const;

export type ReviewCategoryId = (typeof REVIEW_CATEGORY_IDS)[number];
export type ReviewScore = "◎" | "○" | "△";

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategoryId, string> = {
  beginner: "初心者",
  intermediate: "中級者",
  advanced: "上級者",
  moguls: "コブ",
  powder: "パウダー",
  "tree-run": "ツリーラン",
  park: "パーク",
};

export type ResortReviewCategory = {
  id: ReviewCategoryId;
  label: string;
  score: ReviewScore | null;
  good: string | null;
  concern: string | null;
  courses: string[];
  article: string | null;
  hasResearchDetail: boolean;
};

export type ResortReviewData = {
  sourceSlug: string;
  fullArticle: string | null;
  articleSource: "full_article" | "legacy_article" | null;
  categories: ResortReviewCategory[];
  dataIssues: string[];
};
