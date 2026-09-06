import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DataDocument,
  DataDocumentConflictError,
  type DataDocumentSummary,
  type DataDocumentWrite,
} from "@/server/data-documents/contract";
import type { ValidationReport } from "../types";
import {
  listTicketFiles,
  readTicketForEdit,
  type TicketFileDataDocumentClient,
  writeTicketFile,
} from "./ticketFiles";

const TICKET_PREFIX = "lift-ticket/";
const hash = (character: string) => character.repeat(64);

const dataDocument = (
  key: string,
  content: string,
  documentHash: string,
  source: DataDocument["source"] = "bundled",
): DataDocument => ({
  key,
  content,
  mediaType: "application/json",
  hash: documentHash,
  version: source === "bundled" ? 0 : 1,
  source,
});

const asSummary = (document: DataDocument): DataDocumentSummary => {
  const { content: _content, ...summary } = document;
  return summary;
};

class StubDataDocuments implements TicketFileDataDocumentClient {
  readonly documents = new Map<string, DataDocument>();
  listed: DataDocumentSummary[] = [];
  listCalls: Array<string | undefined> = [];
  getCalls: string[] = [];
  writeCalls: DataDocumentWrite[][] = [];
  writeResult: DataDocument[] = [];
  writeError: unknown = null;

  async listDataDocuments(prefix?: string) {
    this.listCalls.push(prefix);
    return this.listed.filter(document =>
      document.key.startsWith(prefix ?? ""),
    );
  }

  async getDataDocument(key: string) {
    this.getCalls.push(key);
    return this.documents.get(key) ?? null;
  }

  async writeDataDocuments(documents: readonly DataDocumentWrite[]) {
    this.writeCalls.push(documents.map(document => ({ ...document })));
    if (this.writeError) throw this.writeError;
    return this.writeResult;
  }
}

const successfulValidation: ValidationReport = {
  ok: true,
  issues: [],
  failedToRun: null,
  checkedAt: "2026-09-04T00:00:00.000Z",
};

test("一覧はticketキーだけを都度DataDocumentから読み込む", async () => {
  const client = new StubDataDocuments();
  const confirmedKey = "lift-ticket/alpha-resort/tickets/2025-2026.json";
  const draftKey = "lift-ticket/beta-resort/tickets/2025-2026.draft.json";
  const brokenKey = "lift-ticket/broken-resort/tickets/2025-2026.json";
  const ignoredKey = "lift-ticket/alpha-resort/sources/page.json";
  const invalidResortKey = "lift-ticket/Bad-Resort/tickets/2025-2026.json";
  const confirmed = dataDocument(
    confirmedKey,
    JSON.stringify({
      season: { label_ja: "2025-26シーズン" },
      offers: [{ id: "day" }],
      data_quality: {
        status: "complete",
        human_review_required: ["review"],
        unresolved_questions: [],
      },
    }),
    hash("a"),
    "database",
  );
  const draft = dataDocument(
    draftKey,
    JSON.stringify({ offers: [], data_quality: {} }),
    hash("b"),
  );
  const broken = dataDocument(brokenKey, "{broken", hash("c"));
  const ignored = dataDocument(ignoredKey, "{}", hash("d"));
  const invalidResort = dataDocument(invalidResortKey, "{}", hash("e"));
  for (const document of [confirmed, draft, broken, ignored, invalidResort]) {
    client.documents.set(document.key, document);
  }
  client.listed = [confirmed, draft, broken, ignored, invalidResort].map(
    asSummary,
  );

  assert.deepEqual(await listTicketFiles(client), [
    {
      resortId: "alpha-resort",
      fileName: "2025-2026.json",
      seasonId: "2025-2026",
      isDraft: false,
      seasonLabelJa: "2025-26シーズン",
      status: "complete",
      offerCount: 1,
      humanReviewCount: 1,
      unresolvedCount: 0,
    },
    {
      resortId: "beta-resort",
      fileName: "2025-2026.draft.json",
      seasonId: "2025-2026",
      isDraft: true,
      seasonLabelJa: null,
      status: null,
      offerCount: 0,
      humanReviewCount: 0,
      unresolvedCount: 0,
    },
  ]);
  assert.deepEqual(client.getCalls, [confirmedKey, draftKey, brokenKey]);

  client.documents.set(
    confirmedKey,
    dataDocument(
      confirmedKey,
      JSON.stringify({ offers: [{}, {}] }),
      hash("f"),
      "database",
    ),
  );
  const refreshed = await listTicketFiles(client);
  assert.equal(refreshed[0]?.offerCount, 2);
  assert.deepEqual(client.listCalls, [TICKET_PREFIX, TICKET_PREFIX]);
});

test("編集読み込みはbundledとDBを区別せず最新hashを返す", async () => {
  const client = new StubDataDocuments();
  const key = "lift-ticket/test-resort/tickets/2025-2026.json";
  client.documents.set(
    key,
    dataDocument(key, JSON.stringify({ value: "bundled" }), hash("a")),
  );

  assert.deepEqual(
    await readTicketForEdit("test-resort", "2025-2026.json", client),
    {
      resortId: "test-resort",
      fileName: "2025-2026.json",
      data: { value: "bundled" },
      fileHash: hash("a"),
    },
  );

  client.documents.set(
    key,
    dataDocument(
      key,
      JSON.stringify({ value: "database" }),
      hash("b"),
      "database",
    ),
  );
  const refreshed = await readTicketForEdit(
    "test-resort",
    "2025-2026.json",
    client,
  );
  assert.equal(refreshed.data.value, "database");
  assert.equal(refreshed.fileHash, hash("b"));
  assert.equal(client.getCalls.length, 2);

  await assert.rejects(
    readTicketForEdit("../invalid", "2025-2026.json", client),
    /不正なスキー場ID/,
  );
  await assert.rejects(
    readTicketForEdit("missing-resort", "2025-2026.json", client),
    /見つかりません/,
  );
});

test("保存はexpectedHash付きの1回のbatchでbundledをDBへ更新する", async () => {
  const client = new StubDataDocuments();
  const key = "lift-ticket/test-resort/tickets/2025-2026.json";
  const oldHash = hash("a");
  const newHash = hash("b");
  client.documents.set(key, dataDocument(key, "{}\n", oldHash));
  client.writeResult = [
    dataDocument(key, '{\n  "offers": []\n}\n', newHash, "database"),
  ];
  let validatedContent = "";

  const result = await writeTicketFile(
    {
      resortId: "test-resort",
      fileName: "2025-2026.json",
      data: { offers: [] },
      fileHash: oldHash,
    },
    client,
    async content => {
      validatedContent = content;
      return successfulValidation;
    },
  );

  const expectedContent = '{\n  "offers": []\n}\n';
  assert.equal(validatedContent, expectedContent);
  assert.deepEqual(client.writeCalls, [
    [
      {
        key,
        content: expectedContent,
        mediaType: "application/json",
        expectedHash: oldHash,
      },
    ],
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.fileHash, newHash);
});

test("writeDataDocumentsのhash競合を既存の再読み込みエラーへ変換する", async () => {
  const client = new StubDataDocuments();
  const key = "lift-ticket/test-resort/tickets/2025-2026.json";
  const oldHash = hash("a");
  const actualHash = hash("b");
  client.documents.set(key, dataDocument(key, "{}\n", oldHash, "database"));
  client.writeError = new DataDocumentConflictError([
    { key, expectedHash: oldHash, actualHash },
  ]);

  const result = await writeTicketFile(
    {
      resortId: "test-resort",
      fileName: "2025-2026.json",
      data: {},
      fileHash: oldHash,
    },
    client,
    async () => successfulValidation,
  );

  assert.deepEqual(result, {
    ok: false,
    errors: [
      "読み込み後にファイルが変更されています。再読み込みしてから編集してください。",
    ],
    report: null,
  });
  assert.equal(client.writeCalls.length, 1);
});

test("保存前にhashが変わった場合と対象が無い場合は書き込まない", async () => {
  const client = new StubDataDocuments();
  const key = "lift-ticket/test-resort/tickets/2025-2026.json";
  client.documents.set(key, dataDocument(key, "{}\n", hash("b"), "database"));

  const conflict = await writeTicketFile(
    {
      resortId: "test-resort",
      fileName: "2025-2026.json",
      data: {},
      fileHash: hash("a"),
    },
    client,
    async () => successfulValidation,
  );
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.match(conflict.errors[0] ?? "", /再読み込み/);

  client.documents.delete(key);
  const missing = await writeTicketFile(
    {
      resortId: "test-resort",
      fileName: "2025-2026.json",
      data: {},
      fileHash: hash("b"),
    },
    client,
    async () => successfulValidation,
  );
  assert.deepEqual(missing, {
    ok: false,
    errors: ["保存先のファイルが見つかりません。"],
    report: null,
  });
  assert.equal(client.writeCalls.length, 0);
});
