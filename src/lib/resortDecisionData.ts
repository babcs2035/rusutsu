import { promises as fs } from "node:fs";
import path from "node:path";
import type { LiftTicketData } from "@/features/lift-ticket/types";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ResortReviewCategory,
  type ResortReviewData,
  type ReviewArticleFile,
  type ReviewCategoryId,
  type ReviewDetailFile,
} from "@/features/reviews/types";

const DATA_ROOT = path.join(process.cwd(), "src/private/data");
// スキー場1件のデータは1ディレクトリにまとまっている:
//   lift-ticket/{resort-id}/{sources,tickets,audits}/
const LIFT_TICKET_ROOT = path.join(DATA_ROOT, "lift-ticket");
const REVIEWS_ROOT = path.join(DATA_ROOT, "reviews");

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

const readTextIfExists = async (filePath: string) => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const readJsonIfExists = async <T>(filePath: string): Promise<T | null> => {
  const raw = await readTextIfExists(filePath);
  return raw ? (JSON.parse(raw) as T) : null;
};

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
  sourceSlug: string,
): Promise<ResortReviewData> => {
  const resortDirectory = path.join(REVIEWS_ROOT, sourceSlug);
  const [detail, article] = await Promise.all([
    readJsonIfExists<ReviewDetailFile>(
      path.join(resortDirectory, "detail.json"),
    ),
    readJsonIfExists<ReviewArticleFile>(
      path.join(resortDirectory, "article.json"),
    ),
  ]);
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

const loadLiftTicketData = async () => {
  const byResortId = new Map<string, LiftTicketData[]>();
  let resortDirectories: Array<{ name: string; isDirectory: () => boolean }>;

  try {
    resortDirectories = await fs.readdir(LIFT_TICKET_ROOT, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return byResortId;
    }
    throw error;
  }

  for (const directory of resortDirectories) {
    if (!directory.isDirectory()) continue;
    const directoryPath = path.join(
      LIFT_TICKET_ROOT,
      directory.name,
      "tickets",
    );
    let fileNames: string[];
    try {
      fileNames = await fs.readdir(directoryPath);
    } catch (error) {
      // tickets/ を持たないディレクトリはスキー場データではない
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    const seasonFileNames = fileNames.filter(fileName =>
      /^\d{4}-\d{4}\.json$/.test(fileName),
    );

    for (const fileName of seasonFileNames) {
      const parsed = JSON.parse(
        await fs.readFile(path.join(directoryPath, fileName), "utf8"),
      ) as LiftTicketData;
      const compactData = toClientLiftTicketData(parsed);
      // リフト券データの resort.id は SkiResort.id と同じ値を使う
      const resortId = parsed.resort.id;
      const seasons = byResortId.get(resortId) ?? [];
      seasons.push(compactData);
      seasons.sort((left, right) =>
        right.season.id.localeCompare(left.season.id),
      );
      byResortId.set(resortId, seasons);
    }
  }

  return byResortId;
};

/**
 * リフト券データをクライアントへ渡す形にする。
 *
 * ★**必要なフィールドを列挙するのではなく、渡さないものだけを落とす。**
 * 列挙する形にしていたため `sources`（出典）と `operating_hours`（営業時間）を
 * 渡し忘れ、料金表の出典番号が常に空・「1日」の指定が解決できない状態になっていた。
 * フィールドを足すたびに渡し忘れる構造だったのをやめる。
 */
const toClientLiftTicketData = (parsed: LiftTicketData): LiftTicketData => {
  const { sources, data_quality, ...rest } = parsed;
  return {
    ...rest,
    // 保存資料のパスは画面から辿れないので落とす（URLとタイトルだけ渡す）
    sources: (sources ?? [])
      .filter(source => Boolean(source.url))
      .map(source => ({
        id: source.id,
        url: source.url,
        page_title: source.page_title ?? null,
      })),
    // unresolved_questions / human_review_required / illegible_items は
    // 収集担当への申し送りなので画面に出さない＝クライアントへも送らない
    data_quality: { status: data_quality.status },
  };
};

const loadReviewData = async () => {
  const byResortId = new Map<string, ResortReviewData>();
  let resortDirectories: Array<{ name: string; isDirectory: () => boolean }>;

  try {
    resortDirectories = await fs.readdir(REVIEWS_ROOT, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return byResortId;
    }
    throw error;
  }

  for (const directory of resortDirectories) {
    if (!directory.isDirectory()) continue;
    let reviewData: ResortReviewData;
    try {
      reviewData = await loadReviewDirectory(directory.name);
    } catch (error) {
      // detail.json / article.json が想定形式と食い違うスキー場が混在している。
      // 1件の不整合で全スキー場のレビュー表示が落ちないよう、その1件だけ
      // reviewData なしとして読み飛ばす（要因調査は別途）。
      console.warn(
        `レビューデータの読み込みに失敗しました（${directory.name}）:`,
        error,
      );
      continue;
    }
    const destinationIds = REVIEW_RESORT_ID_ALIASES[directory.name] ?? [
      directory.name,
    ];
    destinationIds.forEach(resortId => {
      byResortId.set(resortId, reviewData);
    });
  }

  return byResortId;
};

let liftTicketDataPromise: ReturnType<typeof loadLiftTicketData> | undefined;
let reviewDataPromise: ReturnType<typeof loadReviewData> | undefined;

const getLiftTicketData = () => {
  liftTicketDataPromise ??= loadLiftTicketData();
  return liftTicketDataPromise;
};

const getReviewData = () => {
  reviewDataPromise ??= loadReviewData();
  return reviewDataPromise;
};

export const getResortDecisionData = async (
  resortId: string,
): Promise<ResortDecisionData> => {
  const [liftTicketByResortId, reviewByResortId] = await Promise.all([
    getLiftTicketData(),
    getReviewData(),
  ]);
  return {
    liftTickets: liftTicketByResortId.get(resortId) ?? [],
    reviewData: reviewByResortId.get(resortId) ?? null,
  };
};

export const getLiftTicketDataMap = async (resortIds: string[]) => {
  const liftTicketByResortId = await getLiftTicketData();
  return new Map(
    resortIds.map(resortId => [
      resortId,
      liftTicketByResortId.get(resortId) ?? [],
    ]),
  );
};
