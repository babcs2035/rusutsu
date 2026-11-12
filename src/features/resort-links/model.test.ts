import assert from "node:assert/strict";
import test from "node:test";
import {
  groupResortLinks,
  OFFICIAL_SKILL_LINK_TYPES,
  RESORT_LINK_GROUPS,
  RESORT_LINK_TYPES,
  type ResortLinkItem,
} from "./model";

const item = (patch: Partial<ResortLinkItem>): ResortLinkItem => ({
  type: "busTour",
  source: "orion",
  category: null,
  label: null,
  url: "https://example.com/",
  note: null,
  sortOrder: 0,
  ...patch,
});

test("種類は重複がなく、決めた10グループの順に並ぶ", () => {
  const types = RESORT_LINK_TYPES.map(definition => definition.type);
  assert.equal(new Set(types).size, types.length);
  assert.deepEqual(
    RESORT_LINK_GROUPS.map(group => group.label),
    [
      "基本",
      "ゲレンデ",
      "料金",
      "施設",
      "車",
      "公共交通",
      "動画",
      "SNS",
      "天気",
      "他サイト",
    ],
  );
  // 営業状況とリフト券は持ち主が別なので、公式リンクのスキルでは集めない
  for (const type of ["courseStatus", "liftStatus", "liftTicketPrice"])
    assert.equal(OFFICIAL_SKILL_LINK_TYPES.includes(type), false);
});

test("リンクが無い種類も位置を残し、公式を先に並べる", () => {
  const groups = groupResortLinks([
    item({ url: "https://example.com/orion" }),
    item({ source: "official", url: "https://example.com/official" }),
    item({ url: "https://example.com/orion" }),
  ]);
  const transit = groups.find(group => group.id === "transit");
  assert.deepEqual(
    transit?.types.map(type => [type.type, type.links.map(l => l.source)]),
    [
      ["transitAccess", []],
      ["busTimetable", []],
      ["busTour", ["official", "orion"]],
    ],
  );
});

test("同じページでもラベルが違えば別のリンクとして残す", () => {
  const page = "https://rusutsu.com/by-car/";
  const groups = groupResortLinks([
    item({ type: "carAccess", source: "official", url: page, label: "札幌" }),
    item({ type: "carAccess", source: "official", url: page, label: "小樽" }),
    item({ type: "carAccess", source: "official", url: page, label: "札幌" }),
    item({
      type: "news",
      source: "official",
      url: "https://rusutsu.com/news/",
    }),
    item({
      type: "news",
      source: "official",
      url: "https://rusutsu.com/news/",
      label: "お知らせ一覧",
    }),
  ]);
  const labels = (type: string) =>
    groups
      .flatMap(group => group.types)
      .find(definition => definition.type === type)
      ?.links.map(link => link.label);
  assert.deepEqual(labels("carAccess"), ["札幌", "小樽"]);
  assert.deepEqual(labels("news"), ["お知らせ一覧"]);
});
