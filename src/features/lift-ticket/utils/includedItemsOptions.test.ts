import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pageUrlsOfSources } from "@/lib/publicLiftTicketData";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import { calculateDurationOptions } from "./durationOptions";

const NAEBA = path.join(
  process.cwd(),
  "src/private/data/lift-ticket-test-fixtures/ui/naeba/2025-2026.json",
);

/** 苗場の通常1日券に、平日だけ売る食事付きパックを足したデータ */
const withWeekdayLunchPack = (): LiftTicketData => {
  const data = JSON.parse(fs.readFileSync(NAEBA, "utf8")) as LiftTicketData;
  const day = data.products.find(product => product.id === "prod-naeba-1day");
  const standard = data.offers.find(
    offer => offer.id === "offer-naeba-1day-adult",
  );
  assert.ok(day && standard, "前提: 苗場の1日券がある");
  data.calendars.push({
    id: "cal-weekday-only",
    name_ja: "平日",
    included_day_types: ["weekday"],
  } as LiftTicketData["calendars"][number]);
  data.products.push({
    ...day,
    id: "prod-lunch-pack",
    name_ja: "平日ランチパック",
    official_label_ja: "平日ランチパック",
    included_items: [{ type: "meal", name_ja: "昼食券" }],
  });
  data.offers.push({
    ...standard,
    id: "offer-lunch-pack-adult",
    name_ja: "平日ランチパック（おとな）",
    official_label_ja: "平日ランチパック",
    product_id: "prod-lunch-pack",
    calendar_ids: ["cal-weekday-only"],
    price: { currency: "JPY", amount: 9000 },
  });
  return data;
};

const optionsOn = (data: LiftTicketData, date: string) => {
  const input: LiftTicketSearchInput = {
    visitDate: date,
    today: "2025-11-15",
    usePreference: "full_day",
    party: [{ id: "a", category: "adult", age: 30, count: 1 }],
  };
  return calculateDurationOptions(data, input, date, {
    kind: "day",
    withNight: false,
  });
};

test("食事付きパックは、売っている日なら「付いている物がある券」に出す", () => {
  const options = optionsOn(withWeekdayLunchPack(), "2026-01-14");
  const pack = options.withIncludedItems.find(option =>
    option.productIds.includes("prod-lunch-pack"),
  );
  assert.ok(pack, "平日なのに食事付きパックが出ていない");
  assert.equal(pack.total, 9000);
  assert.deepEqual(pack.includedItems, ["昼食券"]);
});

test("その日に売っていない食事付きパックは出さない（¥NaN と出ていた）", () => {
  const options = optionsOn(withWeekdayLunchPack(), "2026-01-17");
  assert.equal(
    options.withIncludedItems.some(option =>
      option.productIds.includes("prod-lunch-pack"),
    ),
    false,
  );
  assert.ok(
    options.withIncludedItems.every(option => Number.isFinite(option.total)),
    "料金の決まらない券が並んでいる",
  );
});

test("画像の出典は、その画像を載せているページのURLにする", () => {
  const urls = pageUrlsOfSources([
    { id: "top", url: "https://example.jp/" },
    {
      id: "price-image",
      url: "https://example.jp/uploads/price.png",
      linked_from_source_id: "top",
    },
    {
      id: "price-pdf",
      url: "https://example.jp/price.pdf",
      linked_from_source_id: "top",
    },
    { id: "lonely-image", url: "https://example.jp/a.jpg" },
  ]);
  assert.equal(urls.get("price-image"), "https://example.jp/");
  // PDFは開けばそのまま読めるので置き換えない
  assert.equal(urls.get("price-pdf"), "https://example.jp/price.pdf");
  // 載せているページが分からない画像はそのまま
  assert.equal(urls.get("lonely-image"), "https://example.jp/a.jpg");
});
