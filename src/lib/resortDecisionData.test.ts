import assert from "node:assert/strict";
import { test } from "node:test";
import { getLiftTicketDataMap } from "./resortDecisionData";

const RESORT = "megahira-onsen-megahira";

const load = async () => {
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

test("フィールドを足したときに渡し忘れない（落とすものだけを明示する）", async () => {
  // ホワイトリスト方式だったため sources / operating_hours を渡し忘れていた。
  // 落とすのは「保存資料のパス」と「収集担当への申し送り」の2つだけ
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
