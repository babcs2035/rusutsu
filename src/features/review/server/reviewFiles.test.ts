import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ReviewArticleCategory,
  ReviewArticleFile,
  ReviewDetailCategory,
  ReviewDetailFile,
} from "@/features/reviews/types";
import {
  type DataDocument,
  DataDocumentConflictError,
  type DataDocumentSummary,
  type DataDocumentWrite,
} from "@/server/data-documents/contract";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import {
  createReviewFileService,
  type ReviewDataDocumentClient,
} from "./reviewFiles";

const detailCategory = (): ReviewDetailCategory => ({
  good: [],
  bad: [],
  courses: [],
});

const articleCategory = (): ReviewArticleCategory => ({
  score: null,
  good: "",
  bad: "",
  courses: [],
});

const detailFile = (
  resortId: string,
  note = "initial",
  withWarning = false,
): ReviewDetailFile => ({
  resortId,
  research: { date: "2026-01-01", note },
  beginner: {
    ...detailCategory(),
    good: withWarning
      ? [
          {
            title: "要確認",
            description: "説明",
            sources: [],
            warn: true,
            warnReason: "根拠を再確認する",
          },
        ]
      : [],
  },
  intermediate: detailCategory(),
  advanced: detailCategory(),
  moguls: detailCategory(),
  powder: detailCategory(),
  "tree-run": detailCategory(),
  park: detailCategory(),
});

const articleFile = (resortId: string, full = "記事"): ReviewArticleFile => ({
  resortId,
  full,
  beginner: articleCategory(),
  intermediate: articleCategory(),
  advanced: articleCategory(),
  moguls: articleCategory(),
  powder: articleCategory(),
  "tree-run": articleCategory(),
  park: articleCategory(),
});

const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const document = (
  key: string,
  content: string,
  source: DataDocument["source"],
  version = source === "database" ? 1 : 0,
): DataDocument => ({
  key,
  content,
  mediaType: "application/json",
  hash: hashDataDocumentContent(content),
  version,
  source,
});

const summary = (value: DataDocument): DataDocumentSummary => {
  const { content: _content, ...result } = value;
  return result;
};

class MemoryReviewDataDocumentClient implements ReviewDataDocumentClient {
  readonly bundled = new Map<string, DataDocument>();
  readonly database = new Map<string, DataDocument>();
  readonly getCalls: string[] = [];
  readonly listCalls: string[] = [];
  readonly writeCalls: DataDocumentWrite[][] = [];
  writeFailure: Error | null = null;

  constructor(documents: readonly DataDocument[] = []) {
    for (const value of documents) {
      (value.source === "database" ? this.database : this.bundled).set(
        value.key,
        value,
      );
    }
  }

  async getDataDocument(key: string): Promise<DataDocument | null> {
    this.getCalls.push(key);
    return this.database.get(key) ?? this.bundled.get(key) ?? null;
  }

  async listDataDocuments(prefix: string): Promise<DataDocumentSummary[]> {
    this.listCalls.push(prefix);
    const union = new Map(
      [...this.bundled.values()]
        .filter(value => value.key.startsWith(prefix))
        .map(value => [value.key, summary(value)]),
    );
    for (const value of this.database.values()) {
      if (value.key.startsWith(prefix)) union.set(value.key, summary(value));
    }
    return [...union.values()];
  }

  async writeDataDocuments(
    documents: readonly DataDocumentWrite[],
  ): Promise<DataDocument[]> {
    this.writeCalls.push(documents.map(value => ({ ...value })));
    if (this.writeFailure) throw this.writeFailure;

    const conflicts = documents.flatMap(value => {
      const actualHash =
        this.database.get(value.key)?.hash ??
        this.bundled.get(value.key)?.hash ??
        null;
      return actualHash === value.expectedHash
        ? []
        : [
            {
              key: value.key,
              expectedHash: value.expectedHash,
              actualHash,
            },
          ];
    });
    if (conflicts.length > 0) throw new DataDocumentConflictError(conflicts);

    const next = new Map(this.database);
    const stored = documents.map(value => {
      const result = document(
        value.key,
        value.content,
        "database",
        (next.get(value.key)?.version ?? 0) + 1,
      );
      next.set(value.key, result);
      return result;
    });
    this.database.clear();
    for (const [key, value] of next) this.database.set(key, value);
    return stored;
  }
}

test("lists only complete review pairs through the canonical document view", async () => {
  const alphaDetailKey = "reviews/alpha/detail.json";
  const alphaArticleKey = "reviews/alpha/article.json";
  const betaDetailKey = "reviews/beta/detail.json";
  const betaArticleKey = "reviews/beta/article.json";
  const client = new MemoryReviewDataDocumentClient([
    document(alphaDetailKey, serialize(detailFile("alpha")), "bundled"),
    document(
      alphaArticleKey,
      serialize(articleFile("alpha", "bundled article")),
      "bundled",
    ),
    document(
      alphaArticleKey,
      serialize(articleFile("alpha", "")),
      "database",
      3,
    ),
    document(
      betaDetailKey,
      serialize(detailFile("beta", "initial", true)),
      "database",
    ),
    document(betaArticleKey, serialize(articleFile("beta")), "bundled"),
    document(
      "reviews/detail-only/detail.json",
      serialize(detailFile("detail-only")),
      "bundled",
    ),
    document(
      "reviews/INVALID/detail.json",
      serialize(detailFile("INVALID")),
      "bundled",
    ),
  ]);
  const service = createReviewFileService(client);

  assert.deepEqual(await service.listReviewResorts(), [
    { resortId: "alpha", warningCount: 0, hasArticle: false },
    { resortId: "beta", warningCount: 1, hasArticle: true },
  ]);
  assert.deepEqual(client.listCalls, ["reviews/"]);
  assert.deepEqual(
    new Set(client.getCalls),
    new Set([alphaDetailKey, alphaArticleKey, betaDetailKey, betaArticleKey]),
  );
});

test("reads fresh document content on every request without a module data cache", async () => {
  const resortId = "fresh-resort";
  const detailKey = `reviews/${resortId}/detail.json`;
  const articleKey = `reviews/${resortId}/article.json`;
  const client = new MemoryReviewDataDocumentClient([
    document(detailKey, serialize(detailFile(resortId)), "bundled"),
    document(articleKey, serialize(articleFile(resortId)), "bundled"),
  ]);
  const service = createReviewFileService(client);

  const first = await service.readReviewForEdit(resortId);
  client.database.set(
    detailKey,
    document(
      detailKey,
      serialize(detailFile(resortId, "updated in database")),
      "database",
    ),
  );
  const second = await service.readReviewForEdit(resortId);

  assert.equal(first.detail.research.note, "initial");
  assert.equal(second.detail.research.note, "updated in database");
  assert.notEqual(second.fileHash, first.fileHash);
  assert.equal(client.getCalls.filter(key => key === detailKey).length, 2);
  assert.equal(client.getCalls.filter(key => key === articleKey).length, 2);
});

test("writes detail and article in one batch with each current hash", async () => {
  const resortId = "save-resort";
  const detailKey = `reviews/${resortId}/detail.json`;
  const articleKey = `reviews/${resortId}/article.json`;
  const originalDetail = document(
    detailKey,
    serialize(detailFile(resortId)),
    "bundled",
  );
  const originalArticle = document(
    articleKey,
    serialize(articleFile(resortId)),
    "bundled",
  );
  const client = new MemoryReviewDataDocumentClient([
    originalDetail,
    originalArticle,
  ]);
  const service = createReviewFileService(client);
  const loaded = await service.readReviewForEdit(resortId);
  const nextDetail = detailFile(resortId, "saved");
  const nextArticle = articleFile(resortId, "保存後の記事");

  const result = await service.writeReviewFiles({
    resortId,
    detail: nextDetail,
    article: nextArticle,
    fileHash: loaded.fileHash,
  });

  assert.equal(result.ok, true);
  assert.equal(client.writeCalls.length, 1);
  assert.deepEqual(
    client.writeCalls[0]?.map(value => ({
      key: value.key,
      expectedHash: value.expectedHash,
    })),
    [
      { key: detailKey, expectedHash: originalDetail.hash },
      { key: articleKey, expectedHash: originalArticle.hash },
    ],
  );
  assert.equal(client.database.get(detailKey)?.content, serialize(nextDetail));
  assert.equal(
    client.database.get(articleKey)?.content,
    serialize(nextArticle),
  );
  const reloaded = await service.readReviewForEdit(resortId);
  assert.equal(result.ok && result.data.fileHash, reloaded.fileHash);
});

test("maps an atomic expectedHash conflict to the existing editor error", async () => {
  const resortId = "conflict-resort";
  const detailKey = `reviews/${resortId}/detail.json`;
  const articleKey = `reviews/${resortId}/article.json`;
  const detail = document(
    detailKey,
    serialize(detailFile(resortId)),
    "database",
  );
  const article = document(
    articleKey,
    serialize(articleFile(resortId)),
    "database",
  );
  const client = new MemoryReviewDataDocumentClient([detail, article]);
  const service = createReviewFileService(client);
  const loaded = await service.readReviewForEdit(resortId);
  client.writeFailure = new DataDocumentConflictError([
    {
      key: articleKey,
      expectedHash: article.hash,
      actualHash: "f".repeat(64),
    },
  ]);

  const result = await service.writeReviewFiles({
    resortId,
    detail: detailFile(resortId, "edited"),
    article: articleFile(resortId, "edited"),
    fileHash: loaded.fileHash,
  });

  assert.deepEqual(result, {
    ok: false,
    errors: [
      "読み込み後にファイルが変更されています。再読み込みしてから編集してください。",
    ],
  });
  assert.equal(client.writeCalls.length, 1);
  assert.equal(client.database.get(detailKey)?.content, detail.content);
  assert.equal(client.database.get(articleKey)?.content, article.content);
});

test("rejects a stale combined hash before attempting a write", async () => {
  const resortId = "stale-resort";
  const detailKey = `reviews/${resortId}/detail.json`;
  const articleKey = `reviews/${resortId}/article.json`;
  const client = new MemoryReviewDataDocumentClient([
    document(detailKey, serialize(detailFile(resortId)), "database"),
    document(articleKey, serialize(articleFile(resortId)), "database"),
  ]);
  const service = createReviewFileService(client);
  const loaded = await service.readReviewForEdit(resortId);
  client.database.set(
    detailKey,
    document(
      detailKey,
      serialize(detailFile(resortId, "changed by another editor")),
      "database",
      2,
    ),
  );

  const result = await service.writeReviewFiles({
    resortId,
    detail: detailFile(resortId, "my edit"),
    article: articleFile(resortId, "my edit"),
    fileHash: loaded.fileHash,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.ok ? [] : result.errors, [
    "読み込み後にファイルが変更されています。再読み込みしてから編集してください。",
  ]);
  assert.equal(client.writeCalls.length, 0);
});
