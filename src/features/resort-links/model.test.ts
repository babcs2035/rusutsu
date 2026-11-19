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

test("種類は重複がなく、決めた11グループの順に並ぶ", () => {
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
      "バスツアー",
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
  const tour = groups.find(group => group.id === "tour");
  assert.deepEqual(
    tour?.types.map(type => [type.type, type.links.map(l => l.source)]),
    [["busTour", ["official", "orion"]]],
  );
});

const linksOf = (groups: ReturnType<typeof groupResortLinks>, type: string) =>
  groups
    .flatMap(group => group.types)
    .find(definition => definition.type === type)?.links;

test("同じページを出発地ごとに分けたリンクは1つにし、食い違う名前は外す", () => {
  const page = "https://rusutsu.com/by-car/";
  const groups = groupResortLinks([
    item({ type: "carAccess", source: "official", url: page, label: "札幌" }),
    item({
      type: "carAccess",
      source: "official",
      url: `${page}#:~:text=%E5%B0%8F%E6%A8%BD`,
      label: "小樽",
    }),
    item({
      type: "news",
      source: "official",
      url: "https://rusutsu.com/news/",
    }),
    item({
      type: "news",
      source: "official",
      url: "https://rusutsu.com/news",
      label: "お知らせ一覧",
    }),
  ]);
  assert.deepEqual(
    linksOf(groups, "carAccess")?.map(link => [link.label, link.url]),
    [[null, page]],
  );
  assert.deepEqual(
    linksOf(groups, "news")?.map(link => link.label),
    ["お知らせ一覧"],
  );
});

test("公式サイトは同じドメインなら1つ、別ドメインの共同サイトは残す", () => {
  const groups = groupResortLinks([
    item({
      type: "officialTop",
      source: "official",
      url: "https://www.yuzawa-nakazato.com/winter/",
    }),
    item({
      type: "officialTop",
      source: "official",
      url: "https://www.yuzawa-nakazato.com/",
      label: "湯沢中里 スノーリゾート",
    }),
    item({
      type: "officialTop",
      source: "official",
      url: "https://takasudyna.com/",
      label: "高鷲, ダイナ",
    }),
  ]);
  assert.deepEqual(
    linksOf(groups, "officialTop")?.map(link => link.url),
    ["https://www.yuzawa-nakazato.com/winter/", "https://takasudyna.com/"],
  );
});

test("レンタル店はレンタルのボタンにまとめ、施設には出さない", () => {
  const groups = groupResortLinks([
    item({
      type: "rentalPrice",
      source: "official",
      url: "https://example.com/rental/",
    }),
    item({
      type: "rentalShop",
      source: "official",
      url: "https://example.com/rental/#shop",
      label: "エンゼル",
    }),
  ]);
  assert.equal(linksOf(groups, "rentalShop"), undefined);
  assert.equal(linksOf(groups, "rentalPrice")?.length, 1);
});

test("バスツアーは1社1件にする", () => {
  const groups = groupResortLinks([
    item({ source: "sunshineTour", url: "https://example.com/a#:~:text=a" }),
    item({ source: "sunshineTour", url: "https://example.com/b" }),
    item({ source: "orion", url: "https://example.com/c" }),
  ]);
  assert.deepEqual(
    linksOf(groups, "busTour")?.map(link => link.source),
    ["sunshineTour", "orion"],
  );
});

test("公式ページが案内するツアー会社は、その会社のボタン1つにまとめる", () => {
  const groups = groupResortLinks([
    item({
      source: "official",
      label: "オリオンツアー",
      url: "https://yoyaku.orion-tour.co.jp/orion/tourlistSki/?GelandeCd=176",
    }),
    item({
      source: "orion",
      url: "https://www.orion-ski.jp/ski_area/gelandes/show/176",
    }),
    item({ source: "rado", label: "関西発", url: "https://example.com/osa" }),
    item({ source: "rado", label: "東海発", url: "https://example.com/ngo" }),
  ]);
  assert.deepEqual(
    linksOf(groups, "busTour")?.map(link => [link.source, link.url]),
    [
      ["orion", "https://www.orion-ski.jp/ski_area/gelandes/show/176"],
      ["rado", "https://example.com/osa"],
      ["rado", "https://example.com/ngo"],
    ],
  );
});
