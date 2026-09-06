import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REVIEW_CATEGORY_IDS } from "../src/features/reviews/types";

test("CLI previews without writes, rejects changed inputs and applies the reviewed pair", () => {
  const repo = process.cwd();
  const root = mkdtempSync(path.join(os.tmpdir(), "review-publish-cli-"));
  try {
    const dir = path.join(root, "src/private/data/reviews/test-resort");
    mkdirSync(dir, { recursive: true });
    const detail = {
      resortId: "test-resort",
      research: { date: "2026-09-06", note: "" },
      ...Object.fromEntries(
        REVIEW_CATEGORY_IDS.map(id => [id, { good: [], bad: [], courses: [] }]),
      ),
    };
    const article = {
      resortId: "test-resort",
      full: "確認済み記事",
      ...Object.fromEntries(
        REVIEW_CATEGORY_IDS.map(id => [
          id,
          { score: null, good: "", bad: "", courses: [] },
        ]),
      ),
    };
    writeFileSync(path.join(dir, "detail.json"), JSON.stringify(detail));
    writeFileSync(path.join(dir, "article.json"), JSON.stringify(article));
    const mock = path.join(root, "mock-fetch.mjs");
    writeFileSync(
      mock,
      `import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, init) => {
  if (init.headers.Authorization !== 'Bearer cli-test-admin-key') throw Error('wrong key');
  if (init.method === 'PUT') {
    if (!url.endsWith('/review-publications')) throw Error('wrong endpoint');
    writeFileSync('submitted.json', init.body);
    return Response.json({ documents: [] });
  }
  return Response.json({ document: null });
};`,
    );
    const run = (apply = false, baseUrl = "https://example.test/rusutsu") =>
      spawnSync(
        process.execPath,
        [
          "--import",
          path.join(repo, "node_modules/tsx/dist/loader.mjs"),
          "--import",
          mock,
          path.join(repo, "scripts/publishReview.ts"),
          "--resort",
          "test-resort",
          ...(apply ? ["--apply"] : []),
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            TSX_TSCONFIG_PATH: path.join(repo, "tsconfig.json"),
            DATA_API_BASE_URL: baseUrl,
            INTERNAL_DATA_API_ADMIN_TOKEN: "cli-test-admin-key",
          },
        },
      );
    const preview = run();
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /確認済み記事/);
    assert.equal(existsSync(path.join(root, "submitted.json")), false);
    assert.notEqual(run(true, "https://other.test/rusutsu").status, 0);
    writeFileSync(
      path.join(dir, "article.json"),
      JSON.stringify({ ...article, full: "未確認の変更" }),
    );
    assert.notEqual(run(true).status, 0);
    assert.equal(existsSync(path.join(root, "submitted.json")), false);
    writeFileSync(path.join(dir, "article.json"), JSON.stringify(article));
    const applied = run(true);
    assert.equal(applied.status, 0, applied.stderr);
    const sent = JSON.parse(
      readFileSync(path.join(root, "submitted.json"), "utf8"),
    );
    assert.equal(sent.content.article.full, "確認済み記事");
    assert.deepEqual(sent.expectedHashes, { detail: null, article: null });
    assert.equal(
      existsSync(path.join(root, ".review-publication-plan.json")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
