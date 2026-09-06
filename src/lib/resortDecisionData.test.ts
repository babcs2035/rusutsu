import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { LiftTicketData } from "@/features/lift-ticket/types";
import {
  REVIEW_CATEGORY_IDS,
  type ReviewArticleFile,
} from "@/features/reviews/types";
import type {
  DataDocument,
  DataDocumentSummary,
} from "@/server/data-documents/contract";
import {
  createResortDecisionDataLoader,
  type ResortDecisionDataDocumentReader,
} from "./resortDecisionData";

const RESORT = "megahira-onsen-megahira";
const TICKET_KEY = `lift-ticket/${RESORT}/tickets/2025-2026.json` as const;
const TICKET_FILE = path.join(
  process.cwd(),
  "src/private/data/lift-ticket",
  RESORT,
  "tickets/2025-2026.json",
);

const asSummary = (document: DataDocument): DataDocumentSummary => ({
  key: document.key,
  mediaType: document.mediaType,
  hash: document.hash,
  version: document.version,
  source: document.source,
});

const jsonDocument = (
  key: string,
  content: string,
  source: DataDocument["source"] = "bundled",
): DataDocument => ({
  key,
  content,
  mediaType: "application/json",
  hash: source === "database" ? "d".repeat(64) : "b".repeat(64),
  version: source === "database" ? 1 : 0,
  source,
});

class MemoryDocumentReader implements ResortDecisionDataDocumentReader {
  readonly documents = new Map<string, DataDocument>();
  readonly getCalls: string[] = [];
  readonly listCalls: string[] = [];

  constructor(documents: readonly DataDocument[] = []) {
    for (const document of documents) this.set(document);
  }

  set(document: DataDocument) {
    this.documents.set(document.key, document);
  }

  async get(key: string) {
    this.getCalls.push(key);
    return this.documents.get(key) ?? null;
  }

  async list(prefix: string) {
    this.listCalls.push(prefix);
    return [...this.documents.values()]
      .filter(document => document.key.startsWith(prefix))
      .map(asSummary);
  }
}

const ticketContent = () => readFile(TICKET_FILE, "utf8");

const load = async () => {
  const reader = new MemoryDocumentReader([
    jsonDocument(TICKET_KEY, await ticketContent()),
  ]);
  const { getLiftTicketDataMap } = createResortDecisionDataLoader(reader);
  const map = await getLiftTicketDataMap([RESORT]);
  const data = map.get(RESORT)?.[0];
  assert.ok(data, "リフト券データが読めない");
  return data;
};

test("出典（sources）を画面に渡す", async () => {
  // 渡していなかったため料金表の [1] [2] と URL 一覧が常に空だった
  const data = await load();
  assert.ok((data.sources ?? []).length > 0);
  for (const source of data.sources ?? []) {
    assert.ok(source.url, `URLが無い出典がある: ${source.id}`);
  }
});

test("営業時間（operating_hours）を画面に渡す", async () => {
  // 1日券が何時間滑れるかの算出元。渡していないと「1日」の指定が解決できない
  const data = await load();
  assert.ok((data.operating_hours ?? []).length > 0);
});

test("収集担当への申し送りはクライアントへ送らない", async () => {
  // unresolved_questions / human_review_required は利用者の行動につながらない
  const data = await load();
  assert.deepEqual(Object.keys(data.data_quality), ["status"]);
});

test("必要な公開フィールドを維持し、保存資料のパスは送らない", async () => {
  // sources / operating_hours の回帰を防ぎながら公開項目を明示する。
  const data = await load();
  const dropped = ["path", "captured_at", "content_hash", "capture_success"];
  for (const source of data.sources ?? []) {
    for (const key of dropped) {
      assert.ok(
        !(key in source),
        `画面に不要なフィールドが渡っている: sources[].${key}`,
      );
    }
  }
  // 逆に、料金の計算・表示に必要なものは渡っていること
  for (const key of [
    "sources",
    "operating_hours",
    "audiences",
    "calendars",
    "products",
    "channels",
    "offers",
    "party_rules",
    "fees",
  ] as const) {
    assert.ok(data[key] != null, `渡し忘れているフィールドがある: ${key}`);
  }
});

test("出典にページタイトルを渡す（ホバー表示に使う）", async () => {
  const data = await load();
  assert.ok(
    (data.sources ?? []).some(source => Boolean(source.page_title)),
    "page_title が渡っていない",
  );
});

test("DB文書の更新をmodule cacheなしで次の読み込みへ反映する", async () => {
  const parsed = JSON.parse(await ticketContent()) as LiftTicketData;
  const reader = new MemoryDocumentReader([
    jsonDocument(TICKET_KEY, JSON.stringify(parsed)),
  ]);
  const { getLiftTicketDataMap } = createResortDecisionDataLoader(reader);

  const before = await getLiftTicketDataMap([RESORT]);
  assert.equal(
    before.get(RESORT)?.[0]?.season.label_ja,
    parsed.season.label_ja,
  );

  const updatedLabel = "DB更新後のシーズン";
  reader.set(
    jsonDocument(
      TICKET_KEY,
      JSON.stringify({
        ...parsed,
        season: { ...parsed.season, label_ja: updatedLabel },
      }),
      "database",
    ),
  );
  const after = await getLiftTicketDataMap([RESORT]);

  assert.equal(after.get(RESORT)?.[0]?.season.label_ja, updatedLabel);
  assert.deepEqual(reader.listCalls, ["lift-ticket/", "lift-ticket/"]);
});

test("レビューの統合IDを正本DataDocumentキーへ解決する", async () => {
  const category = {
    score: "◎" as const,
    good: "**DBの長所**",
    bad: "DBの注意点",
    courses: [],
  };
  const article = {
    resortId: "shiga-kogen-central",
    full: "**DBの概要**",
    ...Object.fromEntries(
      REVIEW_CATEGORY_IDS.map(categoryId => [categoryId, category]),
    ),
  } as ReviewArticleFile;
  const reader = new MemoryDocumentReader([
    jsonDocument(
      "reviews/shiga-kogen-central/article.json",
      JSON.stringify(article),
      "database",
    ),
  ]);
  const { getResortDecisionData } = createResortDecisionDataLoader(reader);

  const result = await getResortDecisionData("shiga-kogen-giant");

  assert.equal(result.reviewData?.sourceSlug, "shiga-kogen-central");
  assert.equal(result.reviewData?.fullArticle, "DBの概要");
  assert.equal(result.reviewData?.categories[0]?.good, "**DBの長所**");
  assert.ok(
    result.reviewData?.dataIssues.includes(
      "調査詳細（detail.json）がありません。",
    ),
  );
  assert.ok(
    reader.getCalls.includes("reviews/shiga-kogen-central/detail.json"),
  );
  assert.ok(
    reader.getCalls.includes("reviews/shiga-kogen-central/article.json"),
  );
});

test("管理用の未知フィールドは料金文書のどの階層からも公開しない", async () => {
  const parsed: unknown = JSON.parse(await ticketContent());
  const addPrivateFields = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(addPrivateFields);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries([
        ...Object.entries(value).map(([key, entry]) => [
          key,
          addPrivateFields(entry),
        ]),
        ["private_debug", "SECRET_NOT_FOR_CLIENT"],
      ]);
    }
    return value;
  };
  const reader = new MemoryDocumentReader([
    jsonDocument(
      TICKET_KEY,
      JSON.stringify(addPrivateFields(parsed)),
      "database",
    ),
  ]);
  const map = await createResortDecisionDataLoader(reader).getLiftTicketDataMap(
    [RESORT],
  );
  const projected = map.get(RESORT)?.[0];
  assert.ok(projected);
  assert.ok((projected.sources ?? []).length > 0);
  assert.ok((projected.operating_hours ?? []).length > 0);
  assert.equal(
    JSON.stringify(projected).includes("SECRET_NOT_FOR_CLIENT"),
    false,
  );
  assert.equal(JSON.stringify(projected).includes("private_debug"), false);
});
