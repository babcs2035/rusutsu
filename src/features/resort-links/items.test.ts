import assert from "node:assert/strict";
import test from "node:test";
import { detailLinkItems } from "./detailItems";
import { legacyLinkItems } from "./legacy";
import { groupResortLinks } from "./model";

test("旧来のリンク文書の項目を、リンク一覧の種類へ対応づける", () => {
  const items = legacyLinkItems({
    officialSiteUrls: [
      { url: "https://rusutsu.com/", description: "公式サイト" },
    ],
    xUrls: [{ url: "https://x.com/rusutsu" }],
    espeYukiUrls: [
      { url: "https://www.youtube.com/watch?v=1", description: "2024年訪問" },
    ],
    mapUrls: [{ url: "not-a-url" }],
  });
  assert.deepEqual(
    items.map(item => [item.type, item.source, item.label]),
    [
      ["officialTop", "official", "公式サイト"],
      ["espeYuki", "espeYuki", "2024年訪問"],
      ["x", "official", null],
    ],
  );
});

test("詳細データが持つURL（営業状況・リフト券・雪マジ）をリンクにする", () => {
  const items = detailLinkItems({
    latitude: 42.7,
    longitude: 140.9,
    operationStatus: {
      courseSourceUrls: ["https://rusutsu.com/lift-and-trail-status/"],
      liftSourceUrls: ["https://rusutsu.com/lift-and-trail-status/"],
    },
    currentConditions: [
      { weather: { sourceUrls: ["https://rusutsu.com/snow/"] }, news: null },
    ],
    liftTickets: [
      {
        main_links: {
          lift_price_url: "https://rusutsu.com/winter-lift-tickets/",
          lift_purchase_url: null,
        },
      },
      { main_links: null },
    ],
    yukiMagi: { url: "https://www.jalan.net/majibu/client/detail/1/" },
  });
  assert.deepEqual(
    items.map(item => item.type),
    [
      "courseStatus",
      "liftStatus",
      "officialSnowReport",
      "liftTicketPrice",
      "yukiMagi",
      "windy",
    ],
  );
  // 同じページがコースとリフトの両方にあっても、種類ごとに1件ずつ出る
  const slope = groupResortLinks(items).find(group => group.id === "slope");
  assert.deepEqual(
    slope?.types.filter(type => type.links.length > 0).map(type => type.type),
    ["courseStatus", "liftStatus"],
  );
});
