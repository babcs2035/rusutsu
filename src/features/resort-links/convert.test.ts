import assert from "node:assert/strict";
import test from "node:test";
import {
  externalSiteRows,
  officialLinkFileSchema,
  officialLinkRows,
  siteLinkLabel,
} from "./convert";
import { OFFICIAL_SKILL_LINK_TYPES } from "./model";

const fileWith = (items: unknown[]) => ({
  resortId: "rusutsu-resort",
  checkedAt: "2026-11-12",
  officialSites: ["https://rusutsu.com/"],
  items: [
    ...items,
    ...OFFICIAL_SKILL_LINK_TYPES.filter(
      type => !items.some(item => (item as { type: string }).type === type),
    ).map(type => ({ type, status: "none" })),
  ],
});

test("公式リンクは found だけを行にし、飛び先つきのURLを優先する", () => {
  const file = officialLinkFileSchema.parse(
    fileWith([
      {
        type: "parking",
        status: "found",
        url: "https://rusutsu.com/by-car/",
        jumpUrl: "https://rusutsu.com/by-car/#parking",
        note: "冬は無料",
      },
      {
        type: "carAccess",
        status: "found",
        label: "札幌",
        url: "https://rusutsu.com/by-car/",
      },
      { type: "busTour", status: "unchecked", note: "ページが開けなかった" },
    ]),
  );
  const rows = officialLinkRows(file);
  assert.deepEqual(
    rows.map(row => [row.type, row.label, row.url, row.note]),
    [
      ["parking", null, "https://rusutsu.com/by-car/#parking", "冬は無料"],
      ["carAccess", "札幌", "https://rusutsu.com/by-car/", null],
    ],
  );
});

test("書かれていない種類・担当外の種類・URLの無い found は形式エラーにする", () => {
  const fails = (value: unknown) =>
    assert.equal(officialLinkFileSchema.safeParse(value).success, false);
  const complete = fileWith([]);
  assert.equal(officialLinkFileSchema.safeParse(complete).success, true);
  fails({ ...complete, items: complete.items.slice(1) });
  fails(
    fileWith([
      { type: "liftStatus", status: "found", url: "https://rusutsu.com/" },
    ]),
  );
  fails(fileWith([{ type: "parking", status: "found" }]));
  fails(
    fileWith([
      { type: "parking", status: "none", url: "https://rusutsu.com/" },
    ]),
  );
});

test("外部サイトはツアーとバスのみを分け、共通券はスキー場ごとの行にする", () => {
  const rows = externalSiteRows({
    siteId: "accessNetwork",
    siteName: "北海道アクセスネットワーク",
    crawledAt: "2026-11-12T00:00:00.000Z",
    entries: [
      {
        name: "ルスツリゾート",
        url: "https://example.com/pack",
        kind: "tour",
        label: "ルスツリゾート：リフト券パック （札幌市内⇒ルスツ）",
        note: "クローラーのメモ",
        resortIds: ["rusutsu-resort"],
        method: "exact",
      },
      {
        name: "ルスツ・ニセコ",
        url: "https://example.com/bus",
        kind: "transportOnly",
        label: "新千歳空港⇔ルスツ・ニセコ",
        resortIds: ["rusutsu-resort", "niseko-village-ski-resort"],
        method: "alias",
      },
      {
        name: "どこにも対応づかない",
        url: "https://example.com/none",
        kind: "tour",
        resortIds: [],
        method: "none",
      },
    ],
  });
  assert.deepEqual(
    rows.map(row => [row.resortId, row.type, row.label, row.note]),
    [
      ["rusutsu-resort", "busTour", "リフト券パック （札幌市内⇒ルスツ）", null],
      ["rusutsu-resort", "transitAccess", "新千歳空港⇔ルスツ・ニセコ", null],
      [
        "niseko-village-ski-resort",
        "transitAccess",
        "新千歳空港⇔ルスツ・ニセコ",
        null,
      ],
    ],
  );
});

test("ラベルの先頭のスキー場名だけを落とす", () => {
  assert.equal(
    siteLinkLabel("【12/1～12/18】キロロ：リフト券パック", "キロロ"),
    "【12/1～12/18】リフト券パック",
  );
  assert.equal(siteLinkLabel("関東発", "苗場スキー場"), "関東発");
  assert.equal(
    siteLinkLabel("Mt.T (谷川岳)", "Mt.T (谷川岳)"),
    "Mt.T (谷川岳)",
  );
  assert.equal(siteLinkLabel(undefined, "苗場"), null);
});
