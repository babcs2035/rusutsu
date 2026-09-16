import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DataDocumentConflictError,
  type DataDocumentWrite,
} from "@/server/data-documents/contract";
import {
  readOsmSlopeConfirmedMap,
  writeOsmSlopeConfirmed,
} from "./slopeConfirmation";

test("OSM confirmation persists, can be cleared, and preserves other resorts after a conflict", async () => {
  let current = { content: "{}", hash: "initial" };
  let conflict = true;
  let writes = 0;
  const store = {
    getDataDocument: async () => ({ ...current }),
    writeDataDocuments: async (documents: readonly DataDocumentWrite[]) => {
      const document = documents[0];
      assert.equal(document.expectedHash, current.hash);
      writes++;
      if (conflict) {
        conflict = false;
        current = {
          content: JSON.stringify({ other: "2026-09-17T00:00:00.000Z" }),
          hash: "concurrent-write",
        };
        throw new DataDocumentConflictError([]);
      }
      current = { content: document.content, hash: `saved-${writes}` };
    },
  };

  await writeOsmSlopeConfirmed("sample-resort", true, store);
  const confirmed = await readOsmSlopeConfirmedMap(store);
  assert.ok(Number.isFinite(Date.parse(confirmed["sample-resort"])));
  assert.equal(confirmed.other, "2026-09-17T00:00:00.000Z");
  assert.equal(writes, 2);

  await writeOsmSlopeConfirmed("sample-resort", false, store);
  assert.deepEqual(await readOsmSlopeConfirmedMap(store), {
    other: "2026-09-17T00:00:00.000Z",
  });
  await assert.rejects(
    writeOsmSlopeConfirmed("../invalid", true, store),
    /不正なスキー場ID/,
  );
  assert.equal(writes, 3);
});
