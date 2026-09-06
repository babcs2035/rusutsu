import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DataDocument,
  DataDocumentConflictError,
  type DataDocumentSummary,
  type StoredDataDocument,
} from "./contract";
import {
  type AtomicDataDocumentWrite,
  type BundledDataDocumentSource,
  type DataDocumentDatabase,
  DataDocumentRepository,
  hashDataDocumentContent,
} from "./repositoryCore";

const storedDocument = (
  key: string,
  content: string,
  version = 1,
): StoredDataDocument => ({
  key,
  content,
  mediaType: key.endsWith(".geojson")
    ? "application/geo+json"
    : "application/json",
  hash: hashDataDocumentContent(content),
  version,
});

const bundledDocument = (key: string, content: string): DataDocument => ({
  ...storedDocument(key, content, 1),
  version: 0,
  source: "bundled",
});

const summary = (document: DataDocument): DataDocumentSummary => {
  const { content: _content, ...result } = document;
  return result;
};

class MemoryBundledSource implements BundledDataDocumentSource {
  readonly documents = new Map<string, DataDocument>();

  constructor(documents: readonly DataDocument[] = []) {
    for (const document of documents)
      this.documents.set(document.key, document);
  }

  async get(key: string) {
    return this.documents.get(key) ?? null;
  }

  async list(prefix: string) {
    return [...this.documents.values()]
      .filter(document => document.key.startsWith(prefix))
      .map(summary);
  }
}

class MemoryDatabase implements DataDocumentDatabase {
  documents = new Map<string, StoredDataDocument>();
  writeCalls = 0;

  constructor(documents: readonly StoredDataDocument[] = []) {
    for (const document of documents)
      this.documents.set(document.key, document);
  }

  async get(key: string) {
    return this.documents.get(key) ?? null;
  }

  async list(prefix: string) {
    return [...this.documents.values()]
      .filter(document => document.key.startsWith(prefix))
      .map(({ content: _content, ...document }) => document);
  }

  async writeBatch(documents: readonly AtomicDataDocumentWrite[]) {
    this.writeCalls += 1;
    const conflicts = documents.flatMap(document => {
      const actualHash =
        this.documents.get(document.key)?.hash ?? document.fallbackHash;
      return actualHash === document.expectedHash
        ? []
        : [
            {
              key: document.key,
              expectedHash: document.expectedHash,
              actualHash,
            },
          ];
    });
    if (conflicts.length > 0) throw new DataDocumentConflictError(conflicts);

    const next = new Map(this.documents);
    const result = documents.map(document => {
      const current = next.get(document.key);
      const stored = storedDocument(
        document.key,
        document.content,
        (current?.version ?? 0) + 1,
      );
      stored.mediaType = document.mediaType;
      next.set(document.key, stored);
      return stored;
    });
    this.documents = next;
    return result;
  }
}

test("reads a bundled file only when the database has no row", async () => {
  const key = "settings/sample.json";
  const bundled = new MemoryBundledSource([
    bundledDocument(key, '{"source":"bundled"}'),
  ]);
  const database = new MemoryDatabase();
  const repository = new DataDocumentRepository(database, bundled);

  assert.equal((await repository.get(key))?.source, "bundled");

  database.documents.set(key, storedDocument(key, '{"source":"db"}', 4));
  const overridden = await repository.get(key);
  assert.equal(overridden?.source, "database");
  assert.equal(overridden?.version, 4);
  assert.equal(overridden?.content, '{"source":"db"}');
});

test("prefix list is a sorted union with database rows taking precedence", async () => {
  const bundled = new MemoryBundledSource([
    bundledDocument("group/a.json", '{"old":true}'),
    bundledDocument("group/b.json", "{}"),
    bundledDocument("other/c.json", "{}"),
  ]);
  const database = new MemoryDatabase([
    storedDocument("group/a.json", '{"new":true}', 2),
    storedDocument("group/c.geojson", "{}", 1),
  ]);
  const repository = new DataDocumentRepository(database, bundled);

  const listed = await repository.list("group/");
  assert.deepEqual(
    listed.map(document => [document.key, document.source, document.version]),
    [
      ["group/a.json", "database", 2],
      ["group/b.json", "bundled", 0],
      ["group/c.geojson", "database", 1],
    ],
  );
});

test("writes a bundled fallback to the database without changing the fallback", async () => {
  const key = "settings/sample.json";
  const fallback = bundledDocument(key, '{"value":1}');
  const bundled = new MemoryBundledSource([fallback]);
  const database = new MemoryDatabase();
  const repository = new DataDocumentRepository(database, bundled);

  const [written] = await repository.writeBatch([
    {
      key,
      content: '{"value":2}',
      mediaType: "application/json",
      expectedHash: fallback.hash,
    },
  ]);

  assert.equal(database.writeCalls, 1);
  assert.equal(written?.source, "database");
  assert.equal(written?.version, 1);
  assert.equal(written?.hash, hashDataDocumentContent('{"value":2}'));
  assert.equal(bundled.documents.get(key)?.content, '{"value":1}');
});

test("a hash conflict aborts every document in the batch", async () => {
  const first = storedDocument("batch/first.json", '{"value":1}', 3);
  const second = storedDocument("batch/second.json", '{"value":2}', 5);
  const database = new MemoryDatabase([first, second]);
  const repository = new DataDocumentRepository(
    database,
    new MemoryBundledSource(),
  );

  await assert.rejects(
    repository.writeBatch([
      {
        key: first.key,
        content: '{"value":10}',
        mediaType: "application/json",
        expectedHash: first.hash,
      },
      {
        key: second.key,
        content: '{"value":20}',
        mediaType: "application/json",
        expectedHash: "f".repeat(64),
      },
    ]),
    (error: unknown) => {
      assert.ok(error instanceof DataDocumentConflictError);
      assert.deepEqual(error.conflicts, [
        {
          key: second.key,
          expectedHash: "f".repeat(64),
          actualHash: second.hash,
        },
      ]);
      return true;
    },
  );

  assert.deepEqual(database.documents.get(first.key), first);
  assert.deepEqual(database.documents.get(second.key), second);
});

test("expectedHash null creates only a genuinely new document", async () => {
  const database = new MemoryDatabase();
  const repository = new DataDocumentRepository(
    database,
    new MemoryBundledSource(),
  );
  const write = {
    key: "new/document.json",
    content: "{}",
    mediaType: "application/json",
    expectedHash: null,
  } as const;

  await repository.writeBatch([write]);
  await assert.rejects(
    repository.writeBatch([write]),
    DataDocumentConflictError,
  );
});

test("default database-only repository exposes deletion and accepts a new null hash", async () => {
  const key = "deleted.json";
  const database = new MemoryDatabase([storedDocument(key, "{}")]);
  const repository = new DataDocumentRepository(database);
  database.documents.delete(key);
  assert.equal(await repository.get(key), null);
  assert.deepEqual(await repository.list(), []);
  const result = await repository.writeBatch([
    { key, content: "{}", mediaType: "application/json", expectedHash: null },
  ]);
  assert.equal(result[0]?.source, "database");
});
