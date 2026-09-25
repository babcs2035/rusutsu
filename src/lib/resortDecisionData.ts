import type { LiftTicketData } from "@/features/lift-ticket/types";
import { normalizeReviewArticle } from "@/features/reviews/normalizeArticle";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ResortReviewCategory,
  type ResortReviewData,
  type ReviewArticleFile,
  type ReviewCategoryId,
  type ReviewDetailFile,
} from "@/features/reviews/types";
import type {
  DataDocument,
  DataDocumentSummary,
} from "@/server/data-documents/contract";
import { toClientLiftTicketData } from "./publicLiftTicketData";

const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const SHIGA_KOGEN_CENTRAL_RESORT_IDS = [
  "shiga-kogen-giant",
  "shiga-kogen-hasuike",
  "shiga-kogen-higashidateyama",
  "shiga-kogen-hoppo-bunadaira",
  "shiga-kogen-ichinose-diamond",
  "shiga-kogen-ichinose-family",
  "shiga-kogen-ichinose-yamanokami",
  "shiga-kogen-maruike",
  "shiga-kogen-nishidateyama",
  "shiga-kogen-sun-valley",
  "shiga-kogen-takamagahara-mammoth",
  "shiga-kogen-tannenomori-okojo",
  "shiga-kogen-terakoya",
];

const REVIEW_RESORT_ID_ALIASES: Record<string, string[]> = {
  "shiga-kogen-central": SHIGA_KOGEN_CENTRAL_RESORT_IDS,
  "shiga-kogen-yokoteyama-shibutoge": [
    "shiga-kogen-yokoteyama",
    "shiga-kogen-shibutoge",
  ],
};

type ResortDecisionData = {
  liftTickets: LiftTicketData[];
  reviewData: ResortReviewData | null;
};

export type ResortDecisionDataDocumentReader = {
  get(key: string): Promise<DataDocument | null>;
  list(prefix: string): Promise<DataDocumentSummary[]>;
};

/** リフト券料金（lift_ticket_seasons）の読み込み口。 */
export type ResortDecisionLiftTicketReader = {
  find(
    resortIds: readonly string[],
  ): Promise<Array<{ resortId: string; data: Record<string, unknown> }>>;
};

const liftTicketReader: ResortDecisionLiftTicketReader = {
  async find(resortIds) {
    const { findLiftTicketSeasons } = await import(
      "@/server/lift-tickets/client"
    );
    return findLiftTicketSeasons(resortIds);
  },
};

const dataDocumentReader: ResortDecisionDataDocumentReader = {
  async get(key) {
    const { getDataDocument } = await import("@/server/data-documents/client");
    return getDataDocument(key);
  },
  async list(prefix) {
    const { listDataDocuments } = await import(
      "@/server/data-documents/client"
    );
    return listDataDocuments(prefix);
  },
};

const parseJsonDocument = <T>(document: DataDocument | null): T | null =>
  document === null ? null : (JSON.parse(document.content) as T);

const stripMarkdown = (value: string) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*-\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const parseReviewCategory = (
  categoryId: ReviewCategoryId,
  detail: ReviewDetailFile | null,
  article: ReviewArticleFile | null,
): ResortReviewCategory => {
  const articleCategory = article?.[categoryId];
  const detailCategory = detail?.[categoryId];
  const good = articleCategory?.good?.trim() || null;
  const concern = articleCategory?.bad?.trim() || null;
  const courses =
    articleCategory?.courses?.map(
      course => `${course.name}：${course.description}`,
    ) ?? [];
  const articleText = [
    articleCategory?.description,
    good,
    concern,
    ...(articleCategory?.courses?.map(
      course => `${course.name}。${course.description}`,
    ) ?? []),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: categoryId,
    label: REVIEW_CATEGORY_LABELS[categoryId],
    score: articleCategory?.score ?? null,
    good,
    concern,
    courses,
    article: articleText ? stripMarkdown(articleText) : null,
    hasResearchDetail: Boolean(detailCategory),
  };
};

const loadReviewDirectory = async (
  reader: ResortDecisionDataDocumentReader,
  sourceSlug: string,
): Promise<ResortReviewData | null> => {
  const prefix = `reviews/${sourceSlug}/`;
  const [detailDocument, articleDocument] = await Promise.all([
    reader.get(`${prefix}detail.json`),
    reader.get(`${prefix}article.json`),
  ]);
  if (!detailDocument && !articleDocument) return null;

  const detail = parseJsonDocument<ReviewDetailFile>(detailDocument);
  const article = articleDocument
    ? normalizeReviewArticle(JSON.parse(articleDocument.content))
    : null;
  const categories = REVIEW_CATEGORY_IDS.map(categoryId =>
    parseReviewCategory(categoryId, detail, article),
  );
  const dataIssues: string[] = [];

  if (!detail) {
    dataIssues.push("調査詳細（detail.json）がありません。");
  }
  if (!article?.full) {
    dataIssues.push("概要記事（article.json の full）がありません。");
  }
  const missingScores = categories.filter(category => !category.score);
  if (missingScores.length > 0) {
    dataIssues.push(
      `評価記事がない項目: ${missingScores
        .map(category => category.label)
        .join("、")}`,
    );
  }
  const warningCount = detail
    ? REVIEW_CATEGORY_IDS.reduce((count, categoryId) => {
        const category = detail[categoryId];
        return (
          count +
          ("warn" in (category ?? {}) &&
          (category as unknown as { warn?: boolean }).warn
            ? 1
            : 0) +
          [
            ...(category?.good ?? []),
            ...(category?.bad ?? []),
            ...(category?.courses ?? []),
          ].filter(item => item.warn).length
        );
      }, 0)
    : 0;
  if (warningCount > 0) {
    dataIssues.push(`人間による確認が必要な調査項目: ${warningCount}件`);
  }

  return {
    sourceSlug,
    fullArticle: article?.full ? stripMarkdown(article.full) : null,
    articleSource: article ? "article_json" : null,
    categories,
    dataIssues,
  };
};

const loadLiftTicketDataMap = async (
  reader: ResortDecisionLiftTicketReader,
  resortIds: readonly string[],
): Promise<Map<string, LiftTicketData[]>> => {
  const requestedResortIds = [
    ...new Set(resortIds.filter(resortId => RESORT_ID_PATTERN.test(resortId))),
  ];
  const byResortId = new Map(
    resortIds.map(resortId => [resortId, [] as LiftTicketData[]]),
  );
  if (requestedResortIds.length === 0) return byResortId;

  // 一覧画面では数百件を一度に読むため、1回の問い合わせにまとめる。
  for (const season of await reader.find(requestedResortIds)) {
    try {
      byResortId
        .get(season.resortId)
        ?.push(toClientLiftTicketData(season.data));
    } catch (error) {
      // 1件の不整合でページ全体を落とさず、そのシーズンだけ表示しない。
      console.warn(
        `リフト券料金の読み込みに失敗しました（${season.resortId}）:`,
        error,
      );
    }
  }

  for (const seasons of byResortId.values()) {
    seasons.sort((left, right) =>
      right.season.id.localeCompare(left.season.id),
    );
  }
  return byResortId;
};

const reviewSourceSlugFor = (resortId: string): string =>
  Object.entries(REVIEW_RESORT_ID_ALIASES).find(([, destinationIds]) =>
    destinationIds.includes(resortId),
  )?.[0] ?? resortId;

const loadReviewData = async (
  reader: ResortDecisionDataDocumentReader,
  resortId: string,
): Promise<ResortReviewData | null> => {
  if (!RESORT_ID_PATTERN.test(resortId)) return null;
  const sourceSlug = reviewSourceSlugFor(resortId);
  try {
    return await loadReviewDirectory(reader, sourceSlug);
  } catch (error) {
    // 1件の不整合でページ全体を落とさず、そのスキー場だけレビューなしにする。
    console.warn(
      `レビューデータの読み込みに失敗しました（${sourceSlug}）:`,
      error,
    );
    return null;
  }
};

/**
 * 永続キャッシュを持たない読み込み口。管理画面でDB文書を更新した後の次の
 * リクエストから、新しい内容がそのまま公開表示へ反映される。
 */
export const createResortDecisionDataLoader = (
  reader: ResortDecisionDataDocumentReader,
  ticketReader: ResortDecisionLiftTicketReader,
) => {
  const getResortDecisionData = async (
    resortId: string,
  ): Promise<ResortDecisionData> => {
    const [liftTicketByResortId, reviewData] = await Promise.all([
      loadLiftTicketDataMap(ticketReader, [resortId]),
      loadReviewData(reader, resortId),
    ]);
    return {
      liftTickets: liftTicketByResortId.get(resortId) ?? [],
      reviewData,
    };
  };

  const getLiftTicketDataMap = (resortIds: string[]) =>
    loadLiftTicketDataMap(ticketReader, resortIds);

  return { getLiftTicketDataMap, getResortDecisionData };
};

const resortDecisionDataLoader = createResortDecisionDataLoader(
  dataDocumentReader,
  liftTicketReader,
);

export const { getLiftTicketDataMap, getResortDecisionData } =
  resortDecisionDataLoader;
