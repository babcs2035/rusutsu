import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  MAP_ENTITIES_MIGRATION_KEY,
  primaryMapKey,
} from "@/server/course-lift/migrationPlan";
import {
  syncMapEntities,
  verifyRelationalDocument,
} from "@/server/course-lift/repository";
import {
  BundledFileDataDocumentSource,
  defaultBundledDataDocumentRoot,
} from "./bundledFileSource";
import {
  DataDocumentConflictError,
  type DataDocumentHashConflict,
  type DataDocumentWrite,
  storedDataDocumentSchema,
  storedDataDocumentSummarySchema,
} from "./contract";
import {
  canUseBundledFixtures,
  DATA_DOCUMENT_INITIALIZATION_KEY,
} from "./initialization";
import {
  type AtomicDataDocumentWrite,
  type DataDocumentDatabase,
  DataDocumentRepository,
} from "./repositoryCore";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

const isRetryableTransactionConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  // 同じ未登録キーを並行作成した場合は、DBによって直列化競合(P2034)ではなく
  // 一意制約違反(P2002)になることがある。再試行してhash不一致として扱う。
  (error.code === "P2034" || error.code === "P2002");

class PrismaDataDocumentDatabase implements DataDocumentDatabase {
  async get(key: string) {
    let row = await prisma.dataDocument.findUnique({
      where: { key },
      select: {
        key: true,
        content: true,
        mediaType: true,
        hash: true,
        version: true,
      },
    });
    if (row === null) return null;
    if (primaryMapKey(key)) {
      const enabled = await prisma.canonicalDataMigration.findUnique({
        where: { key: MAP_ENTITIES_MIGRATION_KEY },
        select: { key: true },
      });
      if (enabled)
        row = await prisma.$transaction(
          async tx => {
            const current = await tx.dataDocument.findUniqueOrThrow({
              where: { key },
            });
            await verifyRelationalDocument(tx, current);
            return current;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        );
    }
    return storedDataDocumentSchema.parse(row);
  }

  async list(prefix: string) {
    if (
      prefix === "resorts-temporary/slope_before/" ||
      prefix === "resorts-temporary/slope_before_osm/"
    ) {
      // Return only the count needed by the resort picker, never the geometry.
      // PostgreSQL 16 IS JSON guards legacy malformed documents before casting.
      const rows = await prisma.$queryRaw<Array<unknown>>(Prisma.sql`
        SELECT key, "mediaType", hash, version,
          CASE WHEN content IS JSON OBJECT THEN
            CASE WHEN content::json ->> 'type' = 'FeatureCollection'
              AND json_typeof(content::json -> 'features') = 'array'
            THEN json_array_length(content::json -> 'features') ELSE 0 END
          ELSE 0 END AS "geoJsonFeatureCount"
        FROM data_documents
        WHERE starts_with(key, ${prefix})
        ORDER BY key ASC
      `);
      return rows.map(row => storedDataDocumentSummarySchema.parse(row));
    }
    const rows = await prisma.dataDocument.findMany({
      where: prefix === "" ? undefined : { key: { startsWith: prefix } },
      orderBy: { key: "asc" },
      select: {
        key: true,
        mediaType: true,
        hash: true,
        version: true,
      },
    });
    return rows.map(row => storedDataDocumentSummarySchema.parse(row));
  }

  async writeBatch(documents: readonly AtomicDataDocumentWrite[]) {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
      attempt++
    ) {
      try {
        return await prisma.$transaction(
          async transaction => {
            const currentRows = await transaction.dataDocument.findMany({
              where: { key: { in: documents.map(document => document.key) } },
              select: {
                key: true,
                content: true,
                mediaType: true,
                hash: true,
                version: true,
              },
            });
            const currentByKey = new Map(
              currentRows.map(row => {
                const document = storedDataDocumentSchema.parse(row);
                return [document.key, document] as const;
              }),
            );
            const conflicts: DataDocumentHashConflict[] = [];
            for (const document of documents) {
              const actualHash =
                currentByKey.get(document.key)?.hash ?? document.fallbackHash;
              if (actualHash !== document.expectedHash) {
                conflicts.push({
                  key: document.key,
                  expectedHash: document.expectedHash,
                  actualHash,
                });
              }
            }
            if (conflicts.length > 0) {
              throw new DataDocumentConflictError(conflicts);
            }

            const stored = [];
            for (const document of documents) {
              const row = await transaction.dataDocument.upsert({
                where: { key: document.key },
                create: {
                  key: document.key,
                  content: document.content,
                  mediaType: document.mediaType,
                  hash: document.hash,
                  version: 1,
                },
                update: {
                  content: document.content,
                  mediaType: document.mediaType,
                  hash: document.hash,
                  version: { increment: 1 },
                },
                select: {
                  key: true,
                  content: true,
                  mediaType: true,
                  hash: true,
                  version: true,
                },
              });
              stored.push(storedDataDocumentSchema.parse(row));
            }
            const enabled = await transaction.canonicalDataMigration.findUnique(
              {
                where: { key: MAP_ENTITIES_MIGRATION_KEY },
                select: { key: true },
              },
            );
            if (enabled)
              await syncMapEntities(
                transaction,
                documents.map(d => d.key),
              );
            return stored;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (
          isRetryableTransactionConflict(error) &&
          attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      "Serializable DataDocument transaction retry limit exceeded",
    );
  }
}

const bundledSource = new BundledFileDataDocumentSource(
  defaultBundledDataDocumentRoot(),
);
const fixtureAllowed = async () => {
  if (!canUseBundledFixtures(process.env, false)) return false;
  const marker = await prisma.canonicalDataMigration.findUnique({
    where: { key: DATA_DOCUMENT_INITIALIZATION_KEY },
    select: { key: true },
  });
  return canUseBundledFixtures(process.env, marker !== null);
};
const directRepository = new DataDocumentRepository(
  new PrismaDataDocumentDatabase(),
  {
    get: async key =>
      (await fixtureAllowed()) ? bundledSource.get(key) : null,
    list: async prefix =>
      (await fixtureAllowed()) ? bundledSource.list(prefix) : [],
  },
);

export const getDataDocumentDirect = (key: string) => directRepository.get(key);

export const listDataDocumentsDirect = (prefix = "") =>
  directRepository.list(prefix);

export const writeDataDocumentsDirect = (
  documents: readonly DataDocumentWrite[],
) => directRepository.writeBatch(documents);
