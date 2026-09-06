import { createHash } from "node:crypto";
import {
  type CrawlLatestSourceMode,
  Prisma,
  type CrawlLatestCategoryKind as PrismaCategoryKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildCrawlLatestPersistenceValidation,
  type CrawlLatestServerValidationIssue,
} from "./contentValidation";
import type { CrawlLatestCategoryKind, CrawlLatestRunInput } from "./contract";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export class CrawlLatestResortNotFoundError extends Error {
  constructor(readonly resortId: string) {
    super(`Unknown ski resort: ${resortId}`);
    this.name = "CrawlLatestResortNotFoundError";
  }
}

export class CrawlLatestIdempotencyConflictError extends Error {
  constructor() {
    super("The idempotency key has already been used for another request");
    this.name = "CrawlLatestIdempotencyConflictError";
  }
}

type PersistResult = {
  runId: string;
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
  created: boolean;
};

type CategoryPersistenceData = {
  kind: CrawlLatestCategoryKind;
  state: CrawlLatestRunInput["categories"][number]["state"];
  validationState: "VALID" | "WARNING" | "INVALID";
  eligibleForCurrent: boolean;
  data: Prisma.InputJsonValue | Prisma.NullTypes.DbNull;
  sourceUrls: string[];
  itemCount: number;
  usableItemCount: number;
  contentHash: string | null;
  nameSetHash: string | null;
};

const canonicalJson = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Non-finite numbers are not valid JSON");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new TypeError("Value is not JSON serializable");
};

export const hashCrawlLatestJson = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const toPrismaJsonOrDbNull = (
  value: CrawlLatestRunInput["categories"][number]["data"],
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull => {
  if (value === undefined || value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

const buildCategoryPersistenceData = (
  input: CrawlLatestRunInput,
): {
  categories: CategoryPersistenceData[];
  serverIssues: CrawlLatestServerValidationIssue[];
  outcome: PersistResult["outcome"];
} => {
  const validation = buildCrawlLatestPersistenceValidation(input);
  const categoryByKind = new Map(
    input.categories.map(category => [category.kind, category]),
  );
  const categories = validation.categories.map(validatedCategory => {
    const category = categoryByKind.get(validatedCategory.kind);
    if (!category) {
      throw new TypeError(`Missing category data: ${validatedCategory.kind}`);
    }
    const uniqueNames = [...new Set(validatedCategory.names)].sort();

    return {
      kind: validatedCategory.kind,
      state: validatedCategory.state,
      validationState: validatedCategory.validationState,
      eligibleForCurrent: validatedCategory.eligibleForCurrent,
      data: toPrismaJsonOrDbNull(category.data),
      sourceUrls: [...new Set(category.sourceUrls)],
      itemCount: validatedCategory.itemCount,
      usableItemCount: validatedCategory.usableItemCount,
      contentHash:
        category.data === undefined ? null : hashCrawlLatestJson(category.data),
      nameSetHash:
        uniqueNames.length === 0 ? null : hashCrawlLatestJson(uniqueNames),
    };
  });

  return {
    categories,
    serverIssues: validation.serverIssues,
    outcome: validation.outcome,
  };
};

const existingResult = async (
  producerId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<PersistResult | null> => {
  const existing = await prisma.crawlLatestRun.findUnique({
    where: {
      producerId_idempotencyKey: { producerId, idempotencyKey },
    },
    select: { id: true, requestHash: true, outcome: true },
  });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new CrawlLatestIdempotencyConflictError();
  }
  return { runId: existing.id, outcome: existing.outcome, created: false };
};

const isKnownPrismaError = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

const shouldReplaceCurrent = (
  existingObservedAt: Date | null,
  incomingObservedAt: Date,
) => existingObservedAt === null || existingObservedAt < incomingObservedAt;

export async function persistCrawlLatestRun(
  input: CrawlLatestRunInput,
  idempotencyKey: string,
): Promise<PersistResult> {
  const requestHash = hashCrawlLatestJson(input);
  const duplicate = await existingResult(
    input.producerId,
    idempotencyKey,
    requestHash,
  );
  if (duplicate) return duplicate;

  const validation = buildCategoryPersistenceData(input);
  const { categories, serverIssues } = validation;
  const isYukiMagi =
    input.producerId === "yuki_magi" && input.resortId === "yuki-magi";
  const outcome = isYukiMagi
    ? input.issues.some(issue => issue.severity === "ERROR")
      ? "FAILED"
      : input.issues.length
        ? "PARTIAL"
        : "SUCCESS"
    : validation.outcome;
  const issues = [...input.issues, ...serverIssues];
  const observedAt = new Date(input.observedAt);
  const completedAt = new Date(input.completedAt);

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt++
  ) {
    try {
      const result = await prisma.$transaction(
        async transaction => {
          const resort = isYukiMagi
            ? null
            : await transaction.skiResort.findUnique({
                where: { id: input.resortId },
                select: { id: true },
              });
          if (!resort && !isYukiMagi) {
            throw new CrawlLatestResortNotFoundError(input.resortId);
          }

          const run = await transaction.crawlLatestRun.create({
            data: {
              producerId: input.producerId,
              idempotencyKey,
              skiResortId: isYukiMagi ? null : input.resortId,
              observedAt,
              completedAt,
              sourceMode: input.sourceMode,
              archiveTimestamp: input.archiveTimestamp,
              schemaVersion: input.schemaVersion,
              crawlerFile: input.crawler.file,
              crawlerRevision: input.crawler.revision,
              crawlerSourceHash: input.crawler.sourceSha256,
              rawPayload: input.rawPayload as Prisma.InputJsonObject,
              requestHash,
              outcome,
            },
            select: { id: true },
          });

          const snapshots = [];
          for (const category of isYukiMagi ? [] : categories) {
            snapshots.push(
              await transaction.crawlLatestCategorySnapshot.create({
                data: {
                  runId: run.id,
                  skiResortId: input.resortId,
                  kind: category.kind,
                  state: category.state,
                  validationState: category.validationState,
                  eligibleForCurrent: category.eligibleForCurrent,
                  data: category.data,
                  sourceUrls: category.sourceUrls,
                  itemCount: category.itemCount,
                  usableItemCount: category.usableItemCount,
                  contentHash: category.contentHash,
                  nameSetHash: category.nameSetHash,
                },
                select: {
                  id: true,
                  kind: true,
                  eligibleForCurrent: true,
                },
              }),
            );
          }

          if (issues.length > 0) {
            await transaction.crawlLatestIssue.createMany({
              data: issues.map(issue => ({
                runId: run.id,
                externalId: issue.externalId,
                categoryKind: issue.categoryKind,
                severity: issue.severity,
                code: issue.code,
                message: issue.message,
                occurrences: issue.occurrences,
                firstOccurredAt: issue.firstOccurredAt
                  ? new Date(issue.firstOccurredAt)
                  : null,
                lastOccurredAt: issue.lastOccurredAt
                  ? new Date(issue.lastOccurredAt)
                  : null,
                blocksPromotion: issue.blocksPromotion,
                details:
                  issue.details === undefined || issue.details === null
                    ? Prisma.DbNull
                    : (issue.details as Prisma.InputJsonValue),
              })),
            });
          }

          if (input.artifacts.length > 0) {
            await transaction.crawlLatestArtifact.createMany({
              data: input.artifacts.map(artifact => ({
                runId: run.id,
                categoryKind: artifact.categoryKind,
                kind: artifact.kind,
                state: artifact.state,
                pageKey: artifact.pageKey,
                title: artifact.title,
                requestedUrl: artifact.requestedUrl,
                finalUrl: artifact.finalUrl,
                httpStatus: artifact.httpStatus,
                storageKey: artifact.storageKey,
                sha256: artifact.sha256,
                sizeBytes:
                  artifact.sizeBytes === undefined
                    ? null
                    : BigInt(artifact.sizeBytes),
                contentType: artifact.contentType,
                contentEncoding: artifact.contentEncoding,
                captureError: artifact.captureError,
                redactionVersion: artifact.redactionVersion,
                issueExternalIds: artifact.issueExternalIds,
                capturedAt: new Date(artifact.capturedAt),
              })),
            });
          }

          for (const snapshot of snapshots) {
            if (!snapshot.eligibleForCurrent) continue;
            const current = await transaction.crawlLatestCurrent.findUnique({
              where: {
                skiResortId_kind: {
                  skiResortId: input.resortId,
                  kind: snapshot.kind,
                },
              },
              select: {
                snapshot: {
                  select: { run: { select: { observedAt: true } } },
                },
              },
            });
            if (
              !shouldReplaceCurrent(
                current?.snapshot.run.observedAt ?? null,
                observedAt,
              )
            ) {
              continue;
            }
            await transaction.crawlLatestCurrent.upsert({
              where: {
                skiResortId_kind: {
                  skiResortId: input.resortId,
                  kind: snapshot.kind,
                },
              },
              create: {
                skiResortId: input.resortId,
                kind: snapshot.kind,
                snapshotId: snapshot.id,
              },
              update: { snapshotId: snapshot.id },
            });
          }

          return { runId: run.id, outcome, created: true } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
      return result;
    } catch (error) {
      if (
        isKnownPrismaError(error, "P2034") &&
        attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS
      ) {
        continue;
      }
      if (isKnownPrismaError(error, "P2002")) {
        const racedDuplicate = await existingResult(
          input.producerId,
          idempotencyKey,
          requestHash,
        );
        if (racedDuplicate) return racedDuplicate;
      }
      throw error;
    }
  }

  throw new Error("Serializable transaction retry limit exceeded");
}

type RunIncludes = {
  rawPayload: boolean;
  categoryData: boolean;
  issues: boolean;
  artifacts: boolean;
};

const runMetadataSelect = {
  id: true,
  producerId: true,
  skiResortId: true,
  observedAt: true,
  completedAt: true,
  sourceMode: true,
  archiveTimestamp: true,
  schemaVersion: true,
  crawlerFile: true,
  crawlerRevision: true,
  crawlerSourceHash: true,
  requestHash: true,
  outcome: true,
  createdAt: true,
} satisfies Prisma.CrawlLatestRunSelect;

const toRunMetadataDto = (run: {
  id: string;
  producerId: string;
  skiResortId: string | null;
  observedAt: Date;
  completedAt: Date;
  sourceMode: CrawlLatestSourceMode;
  archiveTimestamp: string | null;
  schemaVersion: number;
  crawlerFile: string | null;
  crawlerRevision: string | null;
  crawlerSourceHash: string | null;
  requestHash: string;
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
  createdAt: Date;
}) => ({
  id: run.id,
  producerId: run.producerId,
  resortId: run.skiResortId ?? "yuki-magi",
  observedAt: run.observedAt.toISOString(),
  completedAt: run.completedAt.toISOString(),
  sourceMode: run.sourceMode,
  archiveTimestamp: run.archiveTimestamp,
  schemaVersion: run.schemaVersion,
  crawler: {
    file: run.crawlerFile,
    revision: run.crawlerRevision,
    sourceSha256: run.crawlerSourceHash,
  },
  requestHash: run.requestHash,
  outcome: run.outcome,
  createdAt: run.createdAt.toISOString(),
});

const categorySummarySelect = {
  id: true,
  kind: true,
  state: true,
  validationState: true,
  eligibleForCurrent: true,
  itemCount: true,
  usableItemCount: true,
  contentHash: true,
  nameSetHash: true,
  createdAt: true,
} satisfies Prisma.CrawlLatestCategorySnapshotSelect;

const toCategorySummaryDto = (category: {
  id: string;
  kind: PrismaCategoryKind;
  state: "SUCCESS" | "EMPTY" | "NOT_SUPPORTED" | "FAILED";
  validationState: "VALID" | "WARNING" | "INVALID";
  eligibleForCurrent: boolean;
  itemCount: number;
  usableItemCount: number;
  contentHash: string | null;
  nameSetHash: string | null;
  createdAt: Date;
}) => ({
  ...category,
  createdAt: category.createdAt.toISOString(),
});

export async function getCrawlLatestRun(runId: string, includes: RunIncludes) {
  const run = await prisma.crawlLatestRun.findUnique({
    where: { id: runId },
    select: runMetadataSelect,
  });
  if (!run) return null;

  const [categorySummaries, categoryData, rawPayload, issues, artifacts] =
    await Promise.all([
      includes.categoryData
        ? Promise.resolve([])
        : prisma.crawlLatestCategorySnapshot.findMany({
            where: { runId },
            orderBy: { kind: "asc" },
            select: categorySummarySelect,
          }),
      includes.categoryData
        ? prisma.crawlLatestCategorySnapshot.findMany({
            where: { runId },
            orderBy: { kind: "asc" },
            select: {
              ...categorySummarySelect,
              data: true,
              sourceUrls: true,
            },
          })
        : Promise.resolve([]),
      includes.rawPayload
        ? prisma.crawlLatestRun.findUnique({
            where: { id: runId },
            select: { rawPayload: true },
          })
        : Promise.resolve(null),
      includes.issues
        ? prisma.crawlLatestIssue.findMany({
            where: { runId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              externalId: true,
              categoryKind: true,
              severity: true,
              code: true,
              message: true,
              occurrences: true,
              firstOccurredAt: true,
              lastOccurredAt: true,
              blocksPromotion: true,
              details: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      includes.artifacts
        ? prisma.crawlLatestArtifact.findMany({
            where: { runId },
            orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
          })
        : Promise.resolve([]),
    ]);

  const categories = includes.categoryData
    ? categoryData.map(category => ({
        ...toCategorySummaryDto(category),
        data: category.data,
        sourceUrls: category.sourceUrls,
      }))
    : categorySummaries.map(toCategorySummaryDto);

  return {
    ...toRunMetadataDto(run),
    categories,
    ...(rawPayload ? { rawPayload: rawPayload.rawPayload } : {}),
    ...(includes.issues
      ? {
          issues: issues.map(issue => ({
            ...issue,
            firstOccurredAt: issue.firstOccurredAt?.toISOString() ?? null,
            lastOccurredAt: issue.lastOccurredAt?.toISOString() ?? null,
            createdAt: issue.createdAt.toISOString(),
          })),
        }
      : {}),
    ...(includes.artifacts
      ? {
          artifacts: artifacts.map(artifact => ({
            ...artifact,
            sizeBytes: artifact.sizeBytes?.toString() ?? null,
            capturedAt: artifact.capturedAt.toISOString(),
            createdAt: artifact.createdAt.toISOString(),
          })),
        }
      : {}),
  };
}

export async function listCrawlLatestRuns(options: {
  resortId: string;
  sourceMode?: CrawlLatestSourceMode;
  limit: number;
}) {
  const runs = await prisma.crawlLatestRun.findMany({
    where: {
      ...(options.resortId === "yuki-magi"
        ? { producerId: "yuki_magi", skiResortId: null }
        : { skiResortId: options.resortId }),
      sourceMode: options.sourceMode,
    },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    take: options.limit,
    select: runMetadataSelect,
  });
  return runs.map(toRunMetadataDto);
}

export async function getCrawlLatestArtifact(artifactId: string) {
  const artifact = await prisma.crawlLatestArtifact.findUnique({
    where: { id: artifactId },
    include: {
      run: { select: { skiResortId: true } },
    },
  });
  if (!artifact) return null;
  return {
    id: artifact.id,
    runId: artifact.runId,
    resortId: artifact.run.skiResortId,
    categoryKind: artifact.categoryKind,
    kind: artifact.kind,
    state: artifact.state,
    pageKey: artifact.pageKey,
    title: artifact.title,
    requestedUrl: artifact.requestedUrl,
    finalUrl: artifact.finalUrl,
    httpStatus: artifact.httpStatus,
    storageKey: artifact.storageKey,
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes?.toString() ?? null,
    contentType: artifact.contentType,
    contentEncoding: artifact.contentEncoding,
    captureError: artifact.captureError,
    redactionVersion: artifact.redactionVersion,
    issueExternalIds: artifact.issueExternalIds,
    capturedAt: artifact.capturedAt.toISOString(),
    createdAt: artifact.createdAt.toISOString(),
  };
}
