import assert from "node:assert/strict";
import test from "node:test";
import {
  groupResortLinks,
  linkPageKey,
  mergedLinkName,
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

test("同じタブで別の種類が同じページを指すときは、名前を並べたボタン1つにまとめる", () => {
  const lift = "https://www.nango-ski.com/lift/";
  const groups = groupResortLinks([
    item({ type: "pass", source: "official", url: lift, label: "シーズン券" }),
    item({
      type: "rentalPrice",
      source: "official",
      url: `${lift}#:~:text=%E3%83%AC%E3%83%B3%E3%82%BF%E3%83%AB`,
    }),
    item({ type: "liftTicketPrice", source: "official", url: lift }),
    item({
      type: "skiSchool",
      source: "official",
      url: "https://a.jp/school/",
    }),
    item({
      type: "snowboardSchool",
      source: "official",
      url: "https://a.jp/school/",
    }),
    // 別のタブ（車・公共交通）の同じアクセスのページはそれぞれ出す
    item({
      type: "carAccess",
      source: "official",
      url: "https://a.jp/access/",
    }),
    item({ type: "parking", source: "official", url: "https://a.jp/access/" }),
    item({
      type: "transitAccess",
      source: "official",
      url: "https://a.jp/access/",
    }),
  ]);
  const price = linksOf(groups, "liftTicketPrice");
  assert.deepEqual(
    price?.map(link => [link.url, link.mergedTypes]),
    [[lift, ["rentalPrice", "pass"]]],
  );
  assert.equal(
    mergedLinkName(["liftTicketPrice", "rentalPrice", "pass"]),
    "リフト券・レンタル・シーズン券",
  );
  assert.deepEqual(linksOf(groups, "rentalPrice"), []);
  assert.deepEqual(linksOf(groups, "pass"), []);
  assert.equal(
    mergedLinkName([
      "skiSchool",
      ...(linksOf(groups, "skiSchool")?.[0]?.mergedTypes ?? []),
    ]),
    "スクール",
  );
  assert.equal(mergedLinkName(["carAccess", "parking"]), "アクセス・駐車場");
  assert.equal(linksOf(groups, "transitAccess")?.length, 1);
});

test("ゲレンデは同じページでもまとめず、種類ごとにその位置へ飛ぶ", () => {
  const page = "https://www.nango-ski.com/gelande/freepark/";
  const groups = groupResortLinks([
    item({ type: "parkInfo", source: "official", url: page }),
    item({
      type: "parkStatus",
      source: "official",
      url: `${page}#:~:text=%E3%82%A2%E3%82%A4%E3%83%86%E3%83%A0`,
    }),
  ]);
  assert.equal(linksOf(groups, "parkInfo")?.[0]?.url, page);
  assert.equal(
    linksOf(groups, "parkStatus")?.[0]?.url,
    `${page}#:~:text=%E3%82%A2%E3%82%A4%E3%83%86%E3%83%A0`,
  );
});

test("まとめた名前が長いときは先頭の名前と「ほか」にする", () => {
  assert.equal(
    mergedLinkName([
      "liftTicketPrice",
      "rentalPrice",
      "webPurchase",
      "officialDiscount",
      "pass",
    ]),
    "リフト券・レンタル・Web購入ほか",
  );
});

test("外部サイトのリンクは、公式に同じページがあればタブの並びに関係なく外す", () => {
  const asoview = "https://www.asoview.com/channel/tickets/DS75xNiB9D/";
  const groups = groupResortLinks([
    item({ type: "pass", source: "asoview", url: asoview }),
    item({ type: "externalDiscount", source: "official", url: asoview }),
    item({
      type: "externalDiscount",
      source: "asoview",
      url: "https://www.asoview.com/item/ticket/other/",
    }),
  ]);
  assert.deepEqual(linksOf(groups, "pass"), []);
  assert.deepEqual(
    linksOf(groups, "externalDiscount")?.map(link => link.source),
    ["official", "asoview"],
  );
});

test("アソビューは掲載元のチャネル番号が違っても、同じ商品なら同じページ", () => {
  assert.equal(
    linkPageKey(
      "externalDiscount",
      "https://www.asoview.com/channel/ticket/bZLEert5mh/ticket0000035654",
    ),
    linkPageKey(
      "externalDiscount",
      "https://www.asoview.com/channel/ticket/vIh3IOvbXp/ticket0000035654/",
    ),
  );
  assert.equal(
    linkPageKey(
      "externalDiscount",
      "https://www.asoview.com/item/ticket/ticket0000035654/",
    ),
    "asoview.com/ticket/ticket0000035654",
  );
});
