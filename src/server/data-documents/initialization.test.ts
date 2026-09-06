import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canUseBundledFixtures,
  type ImportMarker,
  type ImportMarkerTransaction,
  type OneTimeImportDatabase,
  runOneTimeImport,
} from "./initialization";

type MemoryTransaction = ImportMarkerTransaction & {
  documents: Map<string, string>;
};
function memoryDatabase() {
  let markers = new Map<string, ImportMarker>();
  let documents = new Map<string, string>();
  let tail = Promise.resolve();
  const database: OneTimeImportDatabase<MemoryTransaction> = {
    async transaction(_key, operation) {
      const previous = tail;
      let unlock = () => {};
      tail = new Promise<void>(resolve => {
        unlock = resolve;
      });
      await previous;
      const nextMarkers = new Map(markers);
      const nextDocuments = new Map(documents);
      try {
        const result = await operation({
          documents: nextDocuments,
          getMarker: async key => nextMarkers.get(key) ?? null,
          saveMarker: async (key, sourceHash) => {
            nextMarkers.set(key, { sourceHash });
          },
        });
        markers = nextMarkers;
        documents = nextDocuments;
        return result;
      } finally {
        unlock();
      }
    },
  };
  return { database, documents: () => documents, markers: () => markers };
}

test("completed import never recreates a deleted document or overwrites admin data", async () => {
  const memory = memoryDatabase();
  memory.documents().set("edited", "admin value");
  const operation = async (transaction: MemoryTransaction) => {
    for (const [key, content] of [
      ["edited", "fixture"],
      ["new", "fixture"],
    ]) {
      if (!transaction.documents.has(key))
        transaction.documents.set(key, content);
    }
    return { files: 2 };
  };
  assert.equal(
    (
      await runOneTimeImport(
        memory.database,
        "documents-v1",
        "a".repeat(64),
        operation,
      )
    ).status,
    "completed",
  );
  assert.equal(memory.documents().get("edited"), "admin value");
  memory.documents().delete("new");
  const rerun = await runOneTimeImport(
    memory.database,
    "documents-v1",
    "b".repeat(64),
    operation,
  );
  assert.equal(rerun.status, "already_completed");
  assert.equal(rerun.sourceHash, "a".repeat(64));
  assert.equal(memory.documents().has("new"), false);
});

test("failed import rolls back both documents and completion marker and can retry", async () => {
  const memory = memoryDatabase();
  await assert.rejects(
    runOneTimeImport(
      memory.database,
      "v1",
      "a".repeat(64),
      async transaction => {
        transaction.documents.set("partial", "value");
        throw new Error("source verification failed");
      },
    ),
    /verification failed/u,
  );
  assert.equal(memory.documents().size, 0);
  assert.equal(memory.markers().size, 0);
  assert.equal(
    (
      await runOneTimeImport(
        memory.database,
        "v1",
        "a".repeat(64),
        async () => ({ files: 1 }),
      )
    ).status,
    "completed",
  );
});

test("concurrent initializations execute the import only once", async () => {
  const memory = memoryDatabase();
  let calls = 0;
  const results = await Promise.all(
    [1, 2].map(() =>
      runOneTimeImport(memory.database, "v1", "a".repeat(64), async () => {
        calls += 1;
        return { files: 1 };
      }),
    ),
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    results.map(result => result.status),
    ["completed", "already_completed"],
  );
});

test("bundled fixtures require development opt-in and are forbidden after initialization", () => {
  assert.equal(canUseBundledFixtures({}, false), false);
  assert.equal(
    canUseBundledFixtures(
      { NODE_ENV: "development", DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES: "true" },
      false,
    ),
    true,
  );
  assert.equal(
    canUseBundledFixtures(
      { NODE_ENV: "development", DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES: "true" },
      true,
    ),
    false,
  );
  assert.equal(
    canUseBundledFixtures(
      { NODE_ENV: "production", DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES: "true" },
      false,
    ),
    false,
  );
});
