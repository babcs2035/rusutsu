import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CRAWL_LATEST_ORPHAN_ARTIFACT_TTL_MS,
  CrawlLatestArtifactGarbageCollector,
} from "./artifactGarbageCollector";

const NOW_MS = Date.parse("2026-09-04T12:00:00.000Z");
const OLD_MTIME = new Date(
  NOW_MS - CRAWL_LATEST_ORPHAN_ARTIFACT_TTL_MS - 1_000,
);
const FRESH_MTIME = new Date(
  NOW_MS - CRAWL_LATEST_ORPHAN_ARTIFACT_TTL_MS + 1_000,
);

async function writeFixture(
  root: string,
  storageKey: string,
  modifiedAt: Date,
) {
  const absolutePath = path.join(root, ...storageKey.split("/"));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, storageKey);
  await fs.utimes(absolutePath, modifiedAt, modifiedAt);
  return absolutePath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("deletes only old unreferenced gzip files below crawl_latest_dom", async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-gc-"));
  const root = path.join(sandbox, "artifacts");
  const orphanKey = "crawl_latest_dom/resort/worker/run/manifest/orphan.gz";
  const referencedKey =
    "crawl_latest_dom/resort/worker/run/manifest/referenced.gz";
  const freshKey = "crawl_latest_dom/resort/worker/run/manifest/fresh.gz";

  try {
    const orphan = await writeFixture(root, orphanKey, OLD_MTIME);
    const referenced = await writeFixture(root, referencedKey, OLD_MTIME);
    const fresh = await writeFixture(root, freshKey, FRESH_MTIME);
    const nonGzip = await writeFixture(
      root,
      "crawl_latest_dom/resort/worker/run/manifest/notes.txt",
      OLD_MTIME,
    );
    const otherArtifact = await writeFixture(
      root,
      "yuki-magi/failure/page.gz",
      OLD_MTIME,
    );
    const outside = await writeFixture(sandbox, "outside/linked.gz", OLD_MTIME);
    const symlink = path.join(root, "crawl_latest_dom", "linked.gz");
    await fs.symlink(outside, symlink);

    const queriedKeys: string[][] = [];
    const collector = new CrawlLatestArtifactGarbageCollector({
      artifactRoot: () => root,
      now: () => NOW_MS,
      findReferencedStorageKeys: async storageKeys => {
        queriedKeys.push([...storageKeys]);
        return new Set(
          storageKeys.filter(storageKey => storageKey === referencedKey),
        );
      },
    });

    const result = await collector.maybeCollect();

    assert.deepEqual(result, {
      status: "completed",
      scannedFileCount: 4,
      candidateCount: 2,
      referencedCount: 1,
      deletedCount: 1,
    });
    assert.equal(await pathExists(orphan), false);
    assert.equal(await pathExists(referenced), true);
    assert.equal(await pathExists(fresh), true);
    assert.equal(await pathExists(nonGzip), true);
    assert.equal(await pathExists(otherArtifact), true);
    assert.equal(await pathExists(outside), true);
    assert.equal(await pathExists(symlink), true);
    assert.equal(
      queriedKeys.flat().every(key => key.startsWith("crawl_latest_dom/")),
      true,
    );
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

test("preserves an orphan that becomes referenced during collection", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-gc-"));
  const storageKey = "crawl_latest_dom/resort/worker/run/manifest/page.gz";

  try {
    const artifact = await writeFixture(root, storageKey, OLD_MTIME);
    let lookupCount = 0;
    const collector = new CrawlLatestArtifactGarbageCollector({
      artifactRoot: () => root,
      now: () => NOW_MS,
      findReferencedStorageKeys: async () => {
        lookupCount += 1;
        return lookupCount === 1 ? new Set() : new Set([storageKey]);
      },
    });

    const result = await collector.maybeCollect();

    assert.equal(result.status, "completed");
    assert.equal(result.status === "completed" && result.deletedCount, 0);
    assert.equal(result.status === "completed" && result.referencedCount, 1);
    assert.equal(await pathExists(artifact), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("throttles repeated and concurrent collection attempts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-gc-"));
  let exclusiveRunCount = 0;
  const collector = new CrawlLatestArtifactGarbageCollector({
    artifactRoot: () => root,
    now: () => NOW_MS,
    minimumIntervalMs: 60_000,
    findReferencedStorageKeys: async () => new Set(),
    runExclusive: async task => {
      exclusiveRunCount += 1;
      return { acquired: true, value: await task() };
    },
  });

  try {
    const [first, concurrent] = await Promise.all([
      collector.maybeCollect(),
      collector.maybeCollect(),
    ]);
    const throttled = await collector.maybeCollect();

    assert.deepEqual(concurrent, first);
    assert.deepEqual(throttled, { status: "skipped", reason: "interval" });
    assert.equal(exclusiveRunCount, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("does not delete anything when the reference lookup fails", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-gc-"));
  const storageKey = "crawl_latest_dom/resort/worker/run/manifest/page.gz";

  try {
    const artifact = await writeFixture(root, storageKey, OLD_MTIME);
    const collector = new CrawlLatestArtifactGarbageCollector({
      artifactRoot: () => root,
      now: () => NOW_MS,
      findReferencedStorageKeys: async () => {
        throw new Error("database unavailable");
      },
    });

    await assert.rejects(
      () => collector.maybeCollect(),
      /database unavailable/,
    );
    assert.equal(await pathExists(artifact), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
