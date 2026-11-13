// node --test .shared/skills/maintain-ski-yukimaji/scripts/yukimaji.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { compare, facilityCode, normalizeText } from "./yukimaji.mjs";

const url = (code) =>
  `https://www.jalan.net/majibu/client/detail/${code}/?majiShbtsCd=YUKIMAJI001`;
const entry = (code, extra = {}) => ({
  name: `施設${code}`,
  url: url(code),
  tag: "全日利用可",
  benefit: "【無料クーポン】1日リフト券",
  period: "【無料・割引クーポン共通】12/19～2027/3/14",
  exclusionDate: null,
  ...extra,
});
const yukimaji = (code, extra = {}) => ({
  status: "listed",
  majibu_url: url(code),
  benefit_text_ja: "【無料クーポン】1日リフト券",
  period_text_ja: "【無料・割引クーポン共通】12/19～2027/3/14",
  ...extra,
});

test("施設番号を詳細URLから取る", () => {
  assert.equal(facilityCode(url("CLYUKI000171")), "CLYUKI000171");
  assert.equal(facilityCode(null), null);
});

test("空白と定型の注意書きは変更と見なさない", () => {
  assert.equal(
    normalizeText("12/19～3/14　※営業期間は変更になる可能性があります。"),
    normalizeText(
      "12/19～3/14 ※営業期間は変更になる可能性があります。最新の営業状況を施設のWEBサイトでご確認ください。",
    ),
  );
});

test("状態を切り分ける", () => {
  const rows = compare({
    listing: [
      entry("CLYUKI000001"),
      entry("CLYUKI000002", { period: "【無料・割引クーポン共通】12/21～2027/3/26" }),
      entry("CLYUKI000003"),
      entry("CLYUKI000004"),
      entry("CLYUKI000005"),
      entry("CLYUKI000006", { exclusionDate: "オープン～12/31" }),
      entry("CLYUKI000007", { tag: "準備中" }),
    ],
    map: {
      CLYUKI000001: { resort_ids: ["a"] },
      CLYUKI000002: { resort_ids: ["b"] },
      CLYUKI000003: { resort_ids: ["c"] },
      CLYUKI000004: { resort_ids: ["d"] },
      CLYUKI000006: { resort_ids: ["f"] },
      CLYUKI000007: { resort_ids: ["g"] },
    },
    resorts: {
      a: { exists: true, yukimaji: yukimaji("CLYUKI000001") },
      b: { exists: true, yukimaji: yukimaji("CLYUKI000002") },
      c: { exists: false },
      d: { exists: true, yukimaji: null },
      e: { exists: true, yukimaji: yukimaji("CLYUKI000099") },
      g: { exists: true, yukimaji: yukimaji("CLYUKI000007") },
      f: {
        exists: true,
        yukimaji: yukimaji("CLYUKI000006", {
          period_text_ja:
            "【無料・割引クーポン共通】12/19～2027/3/14 除外日オープン～12/31",
        }),
      },
    },
  });
  const state = Object.fromEntries(
    rows.map((row) => [row.resort_id ?? row.code, row.state]),
  );
  assert.deepEqual(state, {
    a: "current",
    b: "text_changed",
    c: "no_json",
    d: "missing_in_json",
    CLYUKI000005: "unmapped",
    e: "delisted",
    f: "current",
    g: "current",
  });
});
