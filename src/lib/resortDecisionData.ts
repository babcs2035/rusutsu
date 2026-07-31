import { promises as fs } from "node:fs";
import path from "node:path";
import type { LiftTicketData } from "@/features/lift-ticket/types";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ResortReviewCategory,
  type ResortReviewData,
  type ReviewCategoryId,
  type ReviewScore,
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

const stripMarkdown = (value: string) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*-\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const parseLabeledValue = (article: string, labels: string[]) => {
  const lines = article.split("\n");
  const startIndex = lines.findIndex(line =>
    labels.some(label =>
      new RegExp(`^\\s*-\\s*\\*\\*${label}[：:]?\\*\\*`).test(line),
    ),
  );
  if (startIndex < 0) return null;

  const startLine = lines[startIndex] ?? "";
  const labelStart = startLine.indexOf("**");
  const labelEnd = startLine.indexOf("**", labelStart + 2);
  const content: string[] = [
    labelEnd >= 0 ? startLine.slice(labelEnd + 2) : startLine,
  ];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*-\s*\*\*/.test(line)) break;
    content.push(line);
  }
  return stripMarkdown(content.join("\n"));
};

const parseCourses = (article: string) => {
  const lines = article.split("\n");
  const startIndex = lines.findIndex(line =>
    /^\s*-\s*\*\*コース[：:]?\*\*/.test(line),
  );
  if (startIndex < 0) return [];

  const courses: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*-\s*\*\*/.test(line)) break;
    if (!/^\s+-\s+/.test(line)) continue;
    courses.push(stripMarkdown(line.replace(/^\s*-\s*/, "")));
  }
  return courses;
};

const parseReviewCategory = async (
  resortDirectory: string,
  categoryId: ReviewCategoryId,
): Promise<ResortReviewCategory> => {
  const categoryDirectory = path.join(resortDirectory, categoryId);
  const [article, detail] = await Promise.all([
    readTextIfExists(path.join(categoryDirectory, "article.md")),
    readTextIfExists(path.join(categoryDirectory, "detail.md")),
  ]);
  const score =
    (article?.match(/評価[：:]\s*([◎○△])/u)?.[1] as ReviewScore | undefined) ??
    null;

  return {
    id: categoryId,
    label: REVIEW_CATEGORY_LABELS[categoryId],
    score,
    good: article ? parseLabeledValue(article, ["良い点", "強み"]) : null,
    concern: article
      ? parseLabeledValue(article, ["気になる点", "弱み"])
      : null,
    courses: article ? parseCourses(article) : [],
    article: article ? stripMarkdown(article.replace(/^##.*$/m, "")) : null,
    hasResearchDetail: Boolean(detail),
  };
};

const loadReviewDirectory = async (
  sourceSlug: string,
): Promise<ResortReviewData> => {
  const resortDirectory = path.join(REVIEWS_ROOT, sourceSlug);
  const [fullArticle, legacyArticle, categories] = await Promise.all([
    readTextIfExists(path.join(resortDirectory, "full_article.md")),
    readTextIfExists(path.join(resortDirectory, "article.md")),
    Promise.all(
      REVIEW_CATEGORY_IDS.map(categoryId =>
        parseReviewCategory(resortDirectory, categoryId),
      ),
    ),
  ]);
  const summaryArticle = fullArticle ?? legacyArticle;
  const dataIssues: string[] = [];

  if (!fullArticle && legacyArticle) {
    dataIssues.push(
      "full_article.md がないため、互換用の article.md を概要に使用しています。",
    );
  }
  if (!summaryArticle) {
    dataIssues.push("概要記事（full_article.md / article.md）がありません。");
  }
  const missingScores = categories.filter(category => !category.score);
  if (missingScores.length > 0) {
    dataIssues.push(
      `評価記事がない項目: ${missingScores
        .map(category => category.label)
        .join("、")}`,
    );
  }

  return {
    sourceSlug,
    fullArticle: summaryArticle ? stripMarkdown(summaryArticle) : null,
    articleSource: fullArticle
      ? "full_article"
      : legacyArticle
        ? "legacy_article"
        : null,
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
      const compactData: LiftTicketData = {
        schema_version: parsed.schema_version,
        resort: parsed.resort,
        season: parsed.season,
        audiences: parsed.audiences,
        calendars: parsed.calendars,
        products: parsed.products,
        channels: parsed.channels,
        offers: parsed.offers,
        party_rules: parsed.party_rules,
        fees: parsed.fees,
        calculation_policy: parsed.calculation_policy,
        data_quality: parsed.data_quality,
      };
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
    const reviewData = await loadReviewDirectory(directory.name);
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
