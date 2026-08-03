import type {
  ReviewArticleFile,
  ReviewDetailFile,
} from "@/features/reviews/types";

export type ReviewResortSummary = {
  resortId: string;
  warningCount: number;
  hasArticle: boolean;
};

export type ReviewResortOption = ReviewResortSummary & {
  name: string;
};

export type ReviewEditData = {
  detail: ReviewDetailFile;
  article: ReviewArticleFile;
  fileHash: string;
};

export type SaveReviewRequest = ReviewEditData & {
  resortId: string;
};

export type ReviewActionResult =
  | { ok: true; data: ReviewEditData }
  | { ok: false; errors: string[] };
