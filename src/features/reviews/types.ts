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
export type ReviewArticleScore = ReviewScore | null;

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategoryId, string> = {
  beginner: "初心者",
  intermediate: "中級者",
  advanced: "上級者",
  moguls: "コブ",
  powder: "パウダー",
  "tree-run": "ツリーラン",
  park: "パーク",
};

export type ReviewSource = {
  name: string;
  url: string;
  quote: string;
};

export type ReviewDetailEvaluation = {
  title: string;
  description: string;
  sources: ReviewSource[];
  warn: boolean;
  warnReason: string | null;
};

export type ReviewDetailCourse = {
  name: string;
  description: string;
  sources: ReviewSource[];
  warn: boolean;
  warnReason: string | null;
};

export type ReviewDetailCategory = {
  good: ReviewDetailEvaluation[];
  bad: ReviewDetailEvaluation[];
  courses: ReviewDetailCourse[];
};

export type ReviewDetailFile = {
  resortId: string;
  research: {
    date: string;
    note: string;
  };
} & Record<ReviewCategoryId, ReviewDetailCategory>;

export type ReviewArticleCategory = {
  /** 箇条書き形式のdescription項目を表示するときに使用。 */
  description?: string;
  score: ReviewArticleScore;
  good: string;
  bad: string;
  courses: Array<{
    name: string;
    description: string;
  }>;
};

export type ReviewArticleFile = {
  resortId: string;
  full: string;
} & Record<ReviewCategoryId, ReviewArticleCategory>;

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
  articleSource: "article_json" | null;
  categories: ResortReviewCategory[];
  dataIssues: string[];
};
