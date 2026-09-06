import { createHash } from "node:crypto";
import {
  type DataDocument,
  type DataDocumentSummary,
  type DataDocumentWrite,
  dataDocumentBatchWriteSchema,
  dataDocumentKeySchema,
  dataDocumentPrefixSchema,
  type StoredDataDocument,
  type StoredDataDocumentSummary,
} from "./contract";

export type AtomicDataDocumentWrite = DataDocumentWrite & {
  hash: string;
  fallbackHash: string | null;
};

/** DB実装は比較と全書き込みを同じトランザクションで行う必要がある。 */
export interface DataDocumentDatabase {
  get(key: string): Promise<StoredDataDocument | null>;
  list(prefix: string): Promise<StoredDataDocumentSummary[]>;
  writeBatch(
    documents: readonly AtomicDataDocumentWrite[],
  ): Promise<StoredDataDocument[]>;
}

export interface BundledDataDocumentSource {
  get(key: string): Promise<DataDocument | null>;
  list(prefix: string): Promise<DataDocumentSummary[]>;
}

export const hashDataDocumentContent = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

const fromDatabase = (document: StoredDataDocument): DataDocument => ({
  ...document,
  source: "database",
});

const summaryFromDatabase = (
  document: StoredDataDocumentSummary,
): DataDocumentSummary => ({
  ...document,
  source: "database",
});

const compareKeys = (left: DataDocumentSummary, right: DataDocumentSummary) =>
  left.key < right.key ? -1 : left.key > right.key ? 1 : 0;

export class DataDocumentRepository {
  constructor(
    private readonly database: DataDocumentDatabase,
    private readonly bundled?: BundledDataDocumentSource,
  ) {}

  async get(untrustedKey: string): Promise<DataDocument | null> {
    const key = dataDocumentKeySchema.parse(untrustedKey);
    const stored = await this.database.get(key);
    if (stored) return fromDatabase(stored);
    return this.bundled?.get(key) ?? null;
  }

  async list(untrustedPrefix = ""): Promise<DataDocumentSummary[]> {
    const prefix = dataDocumentPrefixSchema.parse(untrustedPrefix);
    const [stored, bundled] = await Promise.all([
      this.database.list(prefix),
      this.bundled?.list(prefix) ?? [],
    ]);

    const union = new Map(bundled.map(document => [document.key, document]));
    for (const document of stored) {
      union.set(document.key, summaryFromDatabase(document));
    }
    return [...union.values()].sort(compareKeys);
  }

  async writeBatch(
    untrustedDocuments: readonly DataDocumentWrite[],
  ): Promise<DataDocument[]> {
    const { documents } = dataDocumentBatchWriteSchema.parse({
      documents: untrustedDocuments,
    });
    const fallbacks = await Promise.all(
      documents.map(document => this.bundled?.get(document.key) ?? null),
    );
    const writes = documents.map((document, index) => ({
      ...document,
      hash: hashDataDocumentContent(document.content),
      fallbackHash: fallbacks[index]?.hash ?? null,
    }));

    const stored = await this.database.writeBatch(writes);
    return stored.map(fromDatabase);
  }
}
