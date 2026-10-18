import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readLegacyOperationStatus } from "./legacyStatus";

test("legacy statuses preserve source URLs and Japan observation time without DB adoption", async () => {
  const temporary = path.resolve("src/private/data/resorts-temporary/tmp");
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(path.join(temporary, "legacy-operation-test-"));
  try {
    const directory = path.join(root, "latest_data/sample");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "2026_1018_070000.json"),
      JSON.stringify({
        time: "2026/10/18 7:00:00",
        courseUrl: "https://example.com/courses",
        courses: [{ name: "A", status: "△", note: "一部" }],
      }),
    );
    const status = await readLegacyOperationStatus("sample", "courses", root);
    assert.ok(status);
    assert.deepEqual(status.sourceUrls, ["https://example.com/courses"]);
    assert.equal(status.items[0].status, "△");
    assert.equal(status.items[0]._observedAt, "2026-10-18T07:00:00+09:00");
    assert.equal(
      status.items[0]._snapshotId,
      "bundled:sample/2026_1018_070000.json",
    );
    assert.equal(
      await readLegacyOperationStatus("sample", "lifts", root),
      null,
    );
    assert.equal(
      await readLegacyOperationStatus("missing", "courses", root),
      null,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
