import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import {
  ArtifactContentConflictError,
  ArtifactContentInvalidError,
  readStoredArtifact,
  saveRenderedDomArtifact,
  verifyStoredRenderedDom,
} from "./artifactStorage";

const gzipAsync = promisify(gzip);

test("rendered DOMをgzipで保存し、同じ内容の再送を受理する", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "crawler-artifact-"));
  const previousRoot = process.env.CRAWLER_ARTIFACT_ROOT;
  process.env.CRAWLER_ARTIFACT_ROOT = root;

  try {
    const html = Buffer.from("<html><body>診断DOM</body></html>");
    const htmlSha256 = createHash("sha256").update(html).digest("hex");
    const firstGzip = await gzipAsync(html, { level: 1 });
    const secondGzip = await gzipAsync(html, { level: 9 });
    const input = {
      producerId: "test-worker",
      idempotencyKey: "run-12345678",
      resortId: "test-resort",
      manifestId: "manifest-1",
      pageKey: "page-a.html",
      expectedHtmlSha256: htmlSha256,
    };

    const first = await saveRenderedDomArtifact({
      ...input,
      compressedHtml: firstGzip,
    });
    const storedPath = path.join(root, ...first.storageKey.split("/"));
    const staleMtime = new Date(Date.now() - 48 * 60 * 60 * 1_000);
    await fs.utimes(storedPath, staleMtime, staleMtime);
    const second = await saveRenderedDomArtifact({
      ...input,
      compressedHtml: secondGzip,
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.storageKey, first.storageKey);
    assert.equal(
      (await fs.stat(storedPath)).mtimeMs > staleMtime.getTime(),
      true,
    );
    const stored = await readStoredArtifact(first.storageKey);
    assert.equal(await verifyStoredRenderedDom(stored, htmlSha256), true);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.CRAWLER_ARTIFACT_ROOT;
    } else {
      process.env.CRAWLER_ARTIFACT_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("HTMLのhashが一致しないartifactを拒否する", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "crawler-artifact-"));
  const previousRoot = process.env.CRAWLER_ARTIFACT_ROOT;
  process.env.CRAWLER_ARTIFACT_ROOT = root;

  try {
    const compressedHtml = await gzipAsync(Buffer.from("<html></html>"));
    await assert.rejects(
      saveRenderedDomArtifact({
        producerId: "test-worker",
        idempotencyKey: "run-12345678",
        resortId: "test-resort",
        manifestId: "manifest-1",
        pageKey: "page-a.html",
        compressedHtml,
        expectedHtmlSha256: "0".repeat(64),
      }),
      ArtifactContentInvalidError,
    );
  } finally {
    if (previousRoot === undefined) {
      delete process.env.CRAWLER_ARTIFACT_ROOT;
    } else {
      process.env.CRAWLER_ARTIFACT_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("同じartifact keyへの競合uploadで既存内容を上書きしない", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "crawler-artifact-"));
  const previousRoot = process.env.CRAWLER_ARTIFACT_ROOT;
  process.env.CRAWLER_ARTIFACT_ROOT = root;

  try {
    const firstHtml = Buffer.from("<html><body>first</body></html>");
    const secondHtml = Buffer.from("<html><body>second</body></html>");
    const common = {
      producerId: "test-worker",
      idempotencyKey: "run-race-12345678",
      resortId: "test-resort",
      manifestId: "manifest-race",
      pageKey: "page-a.html",
    };
    const results = await Promise.allSettled([
      saveRenderedDomArtifact({
        ...common,
        compressedHtml: await gzipAsync(firstHtml),
        expectedHtmlSha256: createHash("sha256")
          .update(firstHtml)
          .digest("hex"),
      }),
      saveRenderedDomArtifact({
        ...common,
        compressedHtml: await gzipAsync(secondHtml),
        expectedHtmlSha256: createHash("sha256")
          .update(secondHtml)
          .digest("hex"),
      }),
    ]);

    assert.equal(
      results.filter(result => result.status === "fulfilled").length,
      1,
    );
    const rejected = results.find(result => result.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assert.ok(rejected.reason instanceof ArtifactContentConflictError);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.CRAWLER_ARTIFACT_ROOT;
    } else {
      process.env.CRAWLER_ARTIFACT_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("artifact root外のstorageKeyを拒否する", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "crawler-artifact-"));
  const previousRoot = process.env.CRAWLER_ARTIFACT_ROOT;
  process.env.CRAWLER_ARTIFACT_ROOT = root;

  try {
    await assert.rejects(
      readStoredArtifact("../../outside.html.gz"),
      ArtifactContentInvalidError,
    );
  } finally {
    if (previousRoot === undefined) {
      delete process.env.CRAWLER_ARTIFACT_ROOT;
    } else {
      process.env.CRAWLER_ARTIFACT_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});
