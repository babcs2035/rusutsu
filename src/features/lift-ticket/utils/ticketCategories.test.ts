import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiftTicketData, LiftTicketProduct } from "../types";
import { commonProductName, ticketCategoriesOf } from "./ticketCategories";

const NAMES: Record<string, string> = {
  dynaland: "ダイナランド",
  "takasu-snow-park": "高鷲スノーパーク",
};

const product = (
  id: string,
  name: string,
  partners: string[] = [],
): LiftTicketProduct => ({
  id,
  name_ja: name,
  shared_with_resorts: partners.map(resortId => ({
    resort_id: resortId,
    name_ja: NAMES[resortId] ?? resortId,
  })),
});

const season = (
  resortId: string,
  products: LiftTicketProduct[],
): LiftTicketData =>
  ({
    resort: { id: resortId },
    season: { id: "2026-2027", label_ja: "2026-27" },
    products,
    offers: products.map(item => ({
      id: `${item.id}-offer`,
      product_id: item.id,
    })),
  }) as unknown as LiftTicketData;

const takasu = season("takasu-snow-park", [
  product("day", "1日券"),
  product("pair-day", "共通1日券", ["dynaland"]),
  product("tm-1", "TAKASU MOUNTAINS TICKET 1日券", [
    "dynaland",
    "washigatake",
    "white-pia-takasu",
  ]),
  product("tm-2", "TAKASU MOUNTAINS TICKET 2日券", [
    "dynaland",
    "washigatake",
    "white-pia-takasu",
  ]),
]);
const dynaland = season("dynaland", [
  product("day", "1日券"),
  product("pair-day", "共通1日券", ["takasu-snow-park"]),
]);

test("1か所では、固有の券・2か所共通・3か所以上の共通に分ける", () => {
  const categories = ticketCategoriesOf([
    {
      resortId: "takasu-snow-park",
      nameJa: "高鷲スノーパーク",
      shortName: "高鷲",
      seasons: [takasu],
    },
  ]);
  assert.deepEqual(
    categories.map(category => [category.kind, category.label]),
    [
      ["own", "高鷲のみ"],
      ["pair", "ダイナランド共通券"],
      ["multi", "TAKASU MOUNTAINS TICKET"],
    ],
  );
  const [, , multi] = categories;
  assert.deepEqual(
    multi.seasons[0].offers.map(offer => offer.product_id),
    ["tm-1", "tm-2"],
  );
});

test("同時表示では、相手の固有の券を足し、同じ顔ぶれの共通券は1つにする", () => {
  const categories = ticketCategoriesOf([
    {
      resortId: "takasu-snow-park",
      nameJa: "高鷲スノーパーク",
      shortName: "高鷲",
      seasons: [takasu],
    },
    {
      resortId: "dynaland",
      nameJa: "ダイナランド",
      shortName: null,
      seasons: [dynaland],
    },
  ]);
  assert.deepEqual(
    categories.map(category => [category.label, category.ownerId]),
    [
      ["高鷲のみ", "takasu-snow-park"],
      ["ダイナランドのみ", "dynaland"],
      ["共通券", "takasu-snow-park"],
      ["TAKASU MOUNTAINS TICKET", "takasu-snow-park"],
    ],
  );
});

test("共通券しかないスキー場は、共通券だけを出す", () => {
  const categories = ticketCategoriesOf([
    {
      resortId: "dynaland",
      nameJa: "ダイナランド",
      shortName: null,
      seasons: [season("dynaland", [product("pair", "共通1日券", ["x"])])],
    },
  ]);
  assert.deepEqual(
    categories.map(category => category.kind),
    ["pair"],
  );
});

test("券名の共通部分を3か所以上の共通券の名前にする", () => {
  assert.equal(
    commonProductName(["ニセコ全山共通 12ポイント券", "ニセコ全山共通 1日券"]),
    "ニセコ全山共通",
  );
  assert.equal(
    commonProductName(["志賀高原全山共通1日券", "志賀高原全山共通4時間券"]),
    "志賀高原全山共通",
  );
  assert.equal(commonProductName(["1日券", "2日券"]), null);
});
