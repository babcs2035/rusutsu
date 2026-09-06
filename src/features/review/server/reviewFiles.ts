import { createHash } from "node:crypto";
import {
  REVIEW_CATEGORY_IDS,
  type ReviewArticleFile,
  type ReviewDetailCourse,
  type ReviewDetailEvaluation,
  type ReviewDetailFile,
  type ReviewSource,
} from "@/features/reviews/types";
import {
  type DataDocument,
  DataDocumentConflictError,
  type DataDocumentSummary,
  type DataDocumentWrite,
} from "@/server/data-documents/contract";
import type {
  ReviewActionResult,
  ReviewEditData,
  ReviewResortSummary,
  SaveReviewRequest,
} from "../types";

const REVIEWS_PREFIX = "reviews/";
const DETAIL_FILE_NAME = "detail.json";
const ARTICLE_FILE_NAME = "article.json";
const REVIEW_READ_BATCH_SIZE = 16;
const CONFLICT_ERROR =
  "読み込み後にファイルが変更されています。再読み込みしてから編集してください。";

const isValidResortId = (value: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const reviewKeys = (resortId: string) => {
  if (!isValidResortId(resortId)) throw new Error("不正なスキー場IDです。");
  const prefix = `${REVIEWS_PREFIX}${resortId}/`;
  return {
    detail: `${prefix}${DETAIL_FILE_NAME}`,
    article: `${prefix}${ARTICLE_FILE_NAME}`,
  };
};

export type ReviewDataDocumentClient = {
  getDataDocument(key: string): Promise<DataDocument | null>;
  listDataDocuments(prefix: string): Promise<DataDocumentSummary[]>;
  writeDataDocuments(
    documents: readonly DataDocumentWrite[],
  ): Promise<DataDocument[]>;
};

type ReviewDocuments = {
  detail: DataDocument;
  article: DataDocument;
};

const canonicalDataDocumentClient: ReviewDataDocumentClient = {
  async getDataDocument(key) {
    const { getDataDocument } = await import("@/server/data-documents/client");
    return getDataDocument(key);
  },
  async listDataDocuments(prefix) {
    const { listDataDocuments } = await import(
      "@/server/data-documents/client"
    );
    return listDataDocuments(prefix);
  },
  async writeDataDocuments(documents) {
    const { writeDataDocuments } = await import(
      "@/server/data-documents/client"
    );
    return writeDataDocuments(documents);
  },
};

const hashFiles = (detailRaw: string, articleRaw: string) =>
  createHash("sha256")
    .update(detailRaw)
    .update("\0")
    .update(articleRaw)
    .digest("hex");

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

const readReviewDocuments = async (
  client: ReviewDataDocumentClient,
  resortId: string,
): Promise<ReviewDocuments | null> => {
  const keys = reviewKeys(resortId);
  const [detail, article] = await Promise.all([
    client.getDataDocument(keys.detail),
    client.getDataDocument(keys.article),
  ]);
  return detail && article ? { detail, article } : null;
};

const requireReviewDocuments = async (
  client: ReviewDataDocumentClient,
  resortId: string,
): Promise<ReviewDocuments> => {
  const documents = await readReviewDocuments(client, resortId);
  if (!documents) throw new Error("レビューデータが見つかりません。");
  return documents;
};

const listReviewResortsWithClient = async (
  client: ReviewDataDocumentClient,
): Promise<ReviewResortSummary[]> => {
  const listed = await client.listDataDocuments(REVIEWS_PREFIX);
  const fileKindsByResort = new Map<string, Set<string>>();
  for (const document of listed) {
    const match = document.key.match(
      /^reviews\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(detail|article)\.json$/u,
    );
    if (!match) continue;
    const [, resortId, fileKind] = match;
    if (!resortId || !fileKind) continue;
    const fileKinds = fileKindsByResort.get(resortId) ?? new Set<string>();
    fileKinds.add(fileKind);
    fileKindsByResort.set(resortId, fileKinds);
  }

  const resortIds = [...fileKindsByResort]
    .filter(
      ([, fileKinds]) => fileKinds.has("detail") && fileKinds.has("article"),
    )
    .map(([resortId]) => resortId);
  const summaries: Array<ReviewResortSummary | null> = [];
  for (
    let index = 0;
    index < resortIds.length;
    index += REVIEW_READ_BATCH_SIZE
  ) {
    const batch = resortIds.slice(index, index + REVIEW_READ_BATCH_SIZE);
    summaries.push(
      ...(await Promise.all(
        batch.map(async resortId => {
          const documents = await readReviewDocuments(client, resortId);
          if (!documents) return null;
          const detail = JSON.parse(
            documents.detail.content,
          ) as ReviewDetailFile;
          const article = JSON.parse(
            documents.article.content,
          ) as ReviewArticleFile;
          return {
            resortId,
            warningCount: warningCount(detail),
            hasArticle: Boolean(article.full),
          } satisfies ReviewResortSummary;
        }),
      )),
    );
  }
  return summaries
    .filter((summary): summary is ReviewResortSummary => summary !== null)
    .sort((left, right) => left.resortId.localeCompare(right.resortId));
};

const readReviewForEditWithClient = async (
  client: ReviewDataDocumentClient,
  resortId: string,
): Promise<ReviewEditData> => {
  const { detail, article } = await requireReviewDocuments(client, resortId);
  return {
    detail: JSON.parse(detail.content) as ReviewDetailFile,
    article: JSON.parse(article.content) as ReviewArticleFile,
    fileHash: hashFiles(detail.content, article.content),
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

const writeReviewFilesWithClient = async (
  client: ReviewDataDocumentClient,
  request: SaveReviewRequest,
): Promise<ReviewActionResult> => {
  const errors = validateRequest(request);
  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors.map(error => `JSON形式が不正です: ${error}`),
    };
  }

  const current = await requireReviewDocuments(client, request.resortId);
  if (
    hashFiles(current.detail.content, current.article.content) !==
    request.fileHash
  ) {
    return {
      ok: false,
      errors: [CONFLICT_ERROR],
    };
  }

  const detailRaw = `${JSON.stringify(request.detail, null, 2)}\n`;
  const articleRaw = `${JSON.stringify(request.article, null, 2)}\n`;
  const keys = reviewKeys(request.resortId);
  try {
    await client.writeDataDocuments([
      {
        key: keys.detail,
        content: detailRaw,
        mediaType: "application/json",
        expectedHash: current.detail.hash,
      },
      {
        key: keys.article,
        content: articleRaw,
        mediaType: "application/json",
        expectedHash: current.article.hash,
      },
    ]);
  } catch (error) {
    if (error instanceof DataDocumentConflictError) {
      return { ok: false, errors: [CONFLICT_ERROR] };
    }
    throw error;
  }

  return {
    ok: true,
    data: {
      detail: request.detail,
      article: request.article,
      fileHash: hashFiles(detailRaw, articleRaw),
    },
  };
};

export const createReviewFileService = (client: ReviewDataDocumentClient) => ({
  listReviewResorts: () => listReviewResortsWithClient(client),
  readReviewForEdit: (resortId: string) =>
    readReviewForEditWithClient(client, resortId),
  writeReviewFiles: (request: SaveReviewRequest) =>
    writeReviewFilesWithClient(client, request),
});

const canonicalReviewFileService = createReviewFileService(
  canonicalDataDocumentClient,
);

export const listReviewResorts = canonicalReviewFileService.listReviewResorts;
export const readReviewForEdit = canonicalReviewFileService.readReviewForEdit;
export const writeReviewFiles = canonicalReviewFileService.writeReviewFiles;
