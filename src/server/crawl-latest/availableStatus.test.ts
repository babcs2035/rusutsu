import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { LatestSuccessfulStatus } from "@/lib/latestStatusFiles";
import {
  findAvailableCrawlLatestStatusDirect,
  listAvailableCrawlLatestResortIdsDirect,
} from "./availableStatus";

let root: string;
const emptyDatabase = {
  async findCurrentCrawlLatestStatusDirect() {
    return null;
  },
  async listCurrentCrawlLatestResortIdsDirect() {
    return [];
  },
};

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "available-crawl-status-"));
  for (const [id, data] of Object.entries({
    "courses-only": { courses: [{ name: "過去のコース" }], lifts: [] },
    "lifts-only": { courses: [], lifts: [{ name: "過去のリフト" }] },
    nameless: { courses: [{ status: "open" }], lifts: [] },
  })) {
    const directory = path.join(root, "latest_data", id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "2026_0101_100000.json"),
      JSON.stringify({ ...data, time: "2026-01-01T10:00:00+09:00" }),
    );
  }
});

after(async () => fs.rm(root, { recursive: true, force: true }));

test("empty DB still exposes bundled results in both the list and mapping detail", async () => {
  for (const kind of ["courses", "lifts"] as const) {
    const ids = await listAvailableCrawlLatestResortIdsDirect(
      kind,
      emptyDatabase,
      root,
    );
    assert.deepEqual(ids, [`${kind}-only`]);
    const status = await findAvailableCrawlLatestStatusDirect(
      ids[0],
      kind,
      emptyDatabase,
      root,
    );
    assert.equal(status?.items.length, 1);
    assert.equal(status?.fileName, "2026_0101_100000.json");
  }
  assert.equal(
    await findAvailableCrawlLatestStatusDirect(
      "missing",
      "courses",
      emptyDatabase,
      root,
    ),
    null,
  );
  assert.equal(
    await findAvailableCrawlLatestStatusDirect(
      "nameless",
      "courses",
      emptyDatabase,
      root,
    ),
    null,
  );
  assert.equal(
    await findAvailableCrawlLatestStatusDirect(
      "courses-only",
      "lifts",
      emptyDatabase,
      root,
    ),
    null,
  );
});

test("adopted DB results take priority over bundled results", async () => {
  const current: LatestSuccessfulStatus = {
    fileName: "db-snapshot.json",
    time: "2025-12-01T00:00:00Z",
    items: [{ name: "DBのコース", status: "closed" }],
    sourceUrls: ["https://example.test/courses"],
  };
  const database = {
    ...emptyDatabase,
    async findCurrentCrawlLatestStatusDirect() {
      return current;
    },
  };
  assert.deepEqual(
    await findAvailableCrawlLatestStatusDirect(
      "courses-only",
      "courses",
      database,
      root,
    ),
    current,
  );
});

test("available IDs merge DB and file results without duplicates and preserve categories", async () => {
  const database = {
    ...emptyDatabase,
    async listCurrentCrawlLatestResortIdsDirect(kind: string) {
      return kind === "courses" ? ["db-only", "courses-only"] : [];
    },
  };
  assert.deepEqual(
    await listAvailableCrawlLatestResortIdsDirect("courses", database, root),
    ["courses-only", "db-only"],
  );
  assert.deepEqual(
    await listAvailableCrawlLatestResortIdsDirect("lifts", database, root),
    ["lifts-only"],
  );
});

test("DB failures propagate instead of silently serving historical data", async () => {
  const database = {
    async findCurrentCrawlLatestStatusDirect(): Promise<never> {
      throw new Error("DB unavailable");
    },
    async listCurrentCrawlLatestResortIdsDirect(): Promise<never> {
      throw new Error("DB unavailable");
    },
  };
  await assert.rejects(
    findAvailableCrawlLatestStatusDirect(
      "courses-only",
      "courses",
      database,
      root,
    ),
    /DB unavailable/,
  );
  await assert.rejects(
    listAvailableCrawlLatestResortIdsDirect("courses", database, root),
    /DB unavailable/,
  );
});
