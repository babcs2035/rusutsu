import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeReviewArticle,
  supportsReviewForm,
} from "@/features/reviews/normalizeArticle";
import { REVIEW_CATEGORY_IDS } from "@/features/reviews/types";
import {
  DataDocumentConflictError,
  type DataDocumentWrite,
} from "@/server/data-documents/contract";
import { prepareReviewPublication, publishReview } from "./publication";
import { reviewContentSchema } from "./publicationContract";

const content = () => ({
  resortId: "test-resort",
  detail: {
    resortId: "test-resort",
    research: { date: "2026-09-06", note: "test" },
    ...Object.fromEntries(
      REVIEW_CATEGORY_IDS.map(id => [id, { good: [], bad: [], courses: [] }]),
    ),
  },
  article: {
    resortId: "test-resort",
    full: "テスト記事",
    ...Object.fromEntries(
      REVIEW_CATEGORY_IDS.map(id => [
        id,
        { score: null, good: "", bad: "", courses: [] },
      ]),
    ),
  },
});

test("AI-format research and bullet articles are preserved on write and readable for display", async () => {
  const raw = {
    resortId: "test-resort",
    detail: {
      resortId: "test-resort",
      research: { date: "2026-09-06", note: "" },
      ...Object.fromEntries(
        REVIEW_CATEGORY_IDS.map(id => [
          id,
          {
            score: "○",
            reason: "検証済みの評価理由",
            courses: [],
            sources: [
              {
                type: "official",
                url: "https://example.test",
                description: "資料",
                quote: "",
              },
            ],
            warn: false,
            warnReason: null,
          },
        ]),
      ),
    },
    article: {
      resortId: "test-resort",
      full: [{ label: "description", text: "全体の説明です。" }],
      ...Object.fromEntries(
        REVIEW_CATEGORY_IDS.map(id => [
          id,
          {
            score: "○",
            reason: [
              { label: "good", text: "練習できます。" },
              { label: "bad", text: "混雑します。" },
            ],
            courses: [],
            warn: false,
            warnReason: null,
          },
        ]),
      ),
    },
  };
  const parsed = reviewContentSchema.parse(raw);
  assert.deepEqual(parsed, raw);
  assert.equal(supportsReviewForm(parsed.detail, parsed.article), false);
  const display = normalizeReviewArticle(parsed.article);
  assert.equal(display.full, "全体の説明です。");
  assert.equal(display.beginner.good, "練習できます。");
  assert.equal(display.beginner.bad, "混雑します。");
  let writes: readonly DataDocumentWrite[] = [];
  await publishReview(
    {
      async getDataDocument() {
        return null;
      },
      async listDataDocuments() {
        return [];
      },
      async writeDataDocuments(batch) {
        writes = batch;
        return [];
      },
    },
    { content: parsed, expectedHashes: { detail: null, article: null } },
  );
  assert.deepEqual(JSON.parse(writes[0].content), raw.detail);
  assert.deepEqual(JSON.parse(writes[1].content), raw.article);
  assert.equal(
    reviewContentSchema.safeParse({
      ...raw,
      article: {
        ...raw.article,
        beginner: { ...parsed.article.beginner, score: "◎" },
      },
    }).success,
    false,
  );
});

test("preview does not write and a new review publishes two files in one batch", async () => {
  const writes: (readonly DataDocumentWrite[])[] = [];
  const client = {
    async getDataDocument() {
      return null;
    },
    async listDataDocuments() {
      return [];
    },
    async writeDataDocuments(batch: readonly DataDocumentWrite[]) {
      writes.push(batch);
      return [];
    },
  };
  const preview = await prepareReviewPublication(client, content());
  assert.equal(writes.length, 0);
  assert.deepEqual(preview.publication.expectedHashes, {
    detail: null,
    article: null,
  });
  await publishReview(client, preview.publication);
  assert.equal(writes.length, 1);
  assert.deepEqual(
    writes[0].map(row => row.key),
    ["reviews/test-resort/detail.json", "reviews/test-resort/article.json"],
  );
  assert.ok(writes[0].every(row => row.expectedHash === null));
});

test("publication keeps preview hashes and does not reread away a conflict", async () => {
  let gets = 0;
  const hash = "a".repeat(64);
  const client = {
    async getDataDocument(key: string) {
      gets++;
      return {
        key,
        content: "{}",
        hash,
        mediaType: "application/json",
        version: 1,
        source: "database" as const,
      };
    },
    async listDataDocuments() {
      return [];
    },
    async writeDataDocuments(
      batch: readonly DataDocumentWrite[],
    ): Promise<never> {
      assert.ok(batch.every(row => row.expectedHash === hash));
      throw new DataDocumentConflictError([
        { key: batch[0].key, expectedHash: hash, actualHash: "b".repeat(64) },
      ]);
    },
  };
  const preview = await prepareReviewPublication(client, content());
  await assert.rejects(
    publishReview(client, preview.publication),
    DataDocumentConflictError,
  );
  assert.equal(gets, 2);
});

test("malformed, mismatched and incomplete reviews fail before publication", () => {
  const valid = content();
  assert.ok(reviewContentSchema.safeParse(valid).success);
  for (const invalid of [
    null,
    {},
    { ...valid, detail: null },
    { ...valid, article: { ...valid.article, resortId: "other-resort" } },
    {
      ...valid,
      detail: {
        ...valid.detail,
        beginner: { good: [null], bad: [], courses: [] },
      },
    },
  ])
    assert.equal(reviewContentSchema.safeParse(invalid).success, false);
});
