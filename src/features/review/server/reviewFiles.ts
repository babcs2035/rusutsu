import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  REVIEW_CATEGORY_IDS,
  type ReviewArticleFile,
  type ReviewDetailCourse,
  type ReviewDetailEvaluation,
  type ReviewDetailFile,
  type ReviewSource,
} from "@/features/reviews/types";
import type {
  ReviewActionResult,
  ReviewEditData,
  ReviewResortSummary,
  SaveReviewRequest,
} from "../types";

const REVIEWS_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "reviews",
);

const isValidResortId = (value: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const reviewPaths = (resortId: string) => {
  if (!isValidResortId(resortId)) throw new Error("不正なスキー場IDです。");
  const directory = path.join(REVIEWS_ROOT, resortId);
  return {
    detail: path.join(directory, "detail.json"),
    article: path.join(directory, "article.json"),
  };
};

const hashFiles = (detailRaw: string, articleRaw: string) =>
  createHash("sha256")
    .update(detailRaw)
    .update("\0")
    .update(articleRaw)
    .digest("hex");

const readRawFiles = async (resortId: string) => {
  const paths = reviewPaths(resortId);
  const [detailRaw, articleRaw] = await Promise.all([
    fs.readFile(paths.detail, "utf8"),
    fs.readFile(paths.article, "utf8"),
  ]);
  return { paths, detailRaw, articleRaw };
};

const warningCount = (detail: ReviewDetailFile) =>
  REVIEW_CATEGORY_IDS.reduce((count, categoryId) => {
    const category = detail[categoryId];
    return (
      count +
      [...category.good, ...category.bad, ...category.courses].filter(
        item => item.warn,
      ).length
    );
  }, 0);

export const listReviewResorts = async (): Promise<ReviewResortSummary[]> => {
  const entries = await fs.readdir(REVIEWS_ROOT, { withFileTypes: true });
  const summaries: ReviewResortSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidResortId(entry.name)) continue;
    try {
      const { detailRaw, articleRaw } = await readRawFiles(entry.name);
      const detail = JSON.parse(detailRaw) as ReviewDetailFile;
      const article = JSON.parse(articleRaw) as ReviewArticleFile;
      summaries.push({
        resortId: entry.name,
        warningCount: warningCount(detail),
        hasArticle: Boolean(article.full),
      });
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
  }
  return summaries.sort((left, right) =>
    left.resortId.localeCompare(right.resortId),
  );
};

export const readReviewForEdit = async (
  resortId: string,
): Promise<ReviewEditData> => {
  const { detailRaw, articleRaw } = await readRawFiles(resortId);
  return {
    detail: JSON.parse(detailRaw) as ReviewDetailFile,
    article: JSON.parse(articleRaw) as ReviewArticleFile,
    fileHash: hashFiles(detailRaw, articleRaw),
  };
};

const validateSource = (
  source: ReviewSource,
  target: string,
  errors: string[],
) => {
  if (typeof source.name !== "string") errors.push(`${target}.name`);
  if (typeof source.url !== "string") errors.push(`${target}.url`);
  if (typeof source.quote !== "string") errors.push(`${target}.quote`);
};

const validateItem = (
  item: ReviewDetailEvaluation | ReviewDetailCourse,
  target: string,
  errors: string[],
) => {
  if ("title" in item && typeof item.title !== "string") {
    errors.push(`${target}.title`);
  }
  if ("name" in item && typeof item.name !== "string") {
    errors.push(`${target}.name`);
  }
  if (typeof item.description !== "string") {
    errors.push(`${target}.description`);
  }
  if (!Array.isArray(item.sources)) {
    errors.push(`${target}.sources`);
  } else {
    item.sources.forEach((source, index) => {
      validateSource(source, `${target}.sources[${index}]`, errors);
    });
  }
  if (typeof item.warn !== "boolean") errors.push(`${target}.warn`);
  if (item.warn) {
    if (
      typeof item.warnReason !== "string" ||
      item.warnReason.trim().length === 0
    ) {
      errors.push(`${target}.warnReason`);
    }
  } else if (item.warnReason !== null) {
    errors.push(`${target}.warnReason`);
  }
};

const validateRequest = (request: SaveReviewRequest) => {
  const errors: string[] = [];
  if (!isValidResortId(request.resortId)) errors.push("resortId");
  if (request.detail.resortId !== request.resortId) {
    errors.push("detail.resortId");
  }
  if (request.article.resortId !== request.resortId) {
    errors.push("article.resortId");
  }
  if (
    typeof request.detail.research.date !== "string" ||
    typeof request.detail.research.note !== "string"
  ) {
    errors.push("detail.research");
  }
  if (typeof request.article.full !== "string") errors.push("article.full");

  for (const categoryId of REVIEW_CATEGORY_IDS) {
    const detailCategory = request.detail[categoryId];
    for (const key of ["good", "bad", "courses"] as const) {
      const items = detailCategory?.[key];
      if (!Array.isArray(items)) {
        errors.push(`detail.${categoryId}.${key}`);
        continue;
      }
      items.forEach((item, index) => {
        validateItem(item, `detail.${categoryId}.${key}[${index}]`, errors);
      });
    }

    const articleCategory = request.article[categoryId];
    if (
      articleCategory?.score !== null &&
      !["◎", "○", "△"].includes(articleCategory?.score)
    ) {
      errors.push(`article.${categoryId}.score`);
    }
    if (typeof articleCategory?.good !== "string") {
      errors.push(`article.${categoryId}.good`);
    }
    if (typeof articleCategory?.bad !== "string") {
      errors.push(`article.${categoryId}.bad`);
    }
    if (!Array.isArray(articleCategory?.courses)) {
      errors.push(`article.${categoryId}.courses`);
    } else {
      articleCategory.courses.forEach((course, index) => {
        if (
          typeof course.name !== "string" ||
          typeof course.description !== "string"
        ) {
          errors.push(`article.${categoryId}.courses[${index}]`);
        }
      });
    }
  }
  return errors;
};

export const writeReviewFiles = async (
  request: SaveReviewRequest,
): Promise<ReviewActionResult> => {
  const errors = validateRequest(request);
  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors.map(error => `JSON形式が不正です: ${error}`),
    };
  }

  const current = await readRawFiles(request.resortId);
  if (hashFiles(current.detailRaw, current.articleRaw) !== request.fileHash) {
    return {
      ok: false,
      errors: [
        "読み込み後にファイルが変更されています。再読み込みしてから編集してください。",
      ],
    };
  }

  const detailRaw = `${JSON.stringify(request.detail, null, 2)}\n`;
  const articleRaw = `${JSON.stringify(request.article, null, 2)}\n`;
  const suffix = randomUUID();
  const detailTemporary = `${current.paths.detail}.${suffix}.tmp`;
  const articleTemporary = `${current.paths.article}.${suffix}.tmp`;

  await Promise.all([
    fs.writeFile(detailTemporary, detailRaw, "utf8"),
    fs.writeFile(articleTemporary, articleRaw, "utf8"),
  ]);
  await fs.rename(detailTemporary, current.paths.detail);
  await fs.rename(articleTemporary, current.paths.article);

  return {
    ok: true,
    data: {
      detail: request.detail,
      article: request.article,
      fileHash: hashFiles(detailRaw, articleRaw),
    },
  };
};
