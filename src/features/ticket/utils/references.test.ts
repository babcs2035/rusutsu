import assert from "node:assert/strict";
import { test } from "node:test";
import type { TicketDocument } from "../types";
import {
  buildIdIndex,
  findDanglingReferences,
  findDuplicateIds,
  findReferrers,
} from "./references";

const document = (): TicketDocument => ({
  audiences: [{ id: "adult", name_ja: "大人" }],
  rental_audiences: [{ id: "ra-child", name_ja: "小人（小学生以下）" }],
  offers: [{ id: "offer-day", audience_ids: ["adult"] }],
  rentals: [
    { id: "rental-adult", audience_ids: ["adult"] },
    { id: "rental-child", audience_ids: ["ra-child"] },
  ],
});

test("レンタル料金の対象者は券とレンタルの人物区分の両方から選べる", () => {
  const index = buildIdIndex(document());

  assert.deepEqual(
    index.rental_audience_choices.map(option => option.id),
    ["adult", "ra-child"],
  );
  assert.deepEqual(
    index.audiences.map(option => option.id),
    ["adult"],
  );
});

test("レンタル人物区分への参照はレンタル料金からだけ正しい参照になる", () => {
  const data = document();
  assert.deepEqual(findDanglingReferences(data), []);

  (data.offers as Array<Record<string, unknown>>)[0].audience_ids = [
    "ra-child",
  ];
  assert.deepEqual(findDanglingReferences(data), [
    "/offers/0/audience_ids/0: ra-child は存在しません",
  ]);
});

test("レンタル料金とレンタル人物区分もID重複・削除時の参照を検出する", () => {
  const data = document();
  (data.rentals as unknown[]).push({ id: "rental-child" });

  assert.deepEqual(findDuplicateIds(data), [
    "レンタル料金: rental-child が重複しています",
  ]);
  assert.deepEqual(findReferrers(data, "ra-child", ["rental_audiences", "0"]), [
    "レンタル料金 / 1 / 人物区分 の 人物区分",
  ]);
});
