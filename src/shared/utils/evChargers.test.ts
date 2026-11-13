import assert from "node:assert/strict";
import test from "node:test";
import { parseEvChargers, summarizeEvChargers } from "./evChargers";

const charger = (kind: "quick" | "normal", kw: number, count: number) => ({
  kind,
  kw,
  count,
  operator: "Terra Charge",
  url: null,
  note: null,
});

test("1行だけなら会社名まで、急速は頭に付ける", () => {
  assert.equal(
    summarizeEvChargers([charger("normal", 6, 4)]),
    "6kW×4 Terra Charge",
  );
  assert.equal(
    summarizeEvChargers([charger("quick", 50, 2)]),
    "急速50kW×2 Terra Charge",
  );
});

test("2行以上は会社名を消して出力と口数だけを並べる", () => {
  assert.equal(
    summarizeEvChargers([charger("normal", 6, 4), charger("quick", 50, 1)]),
    "6kW×4, 50kW×1",
  );
  assert.equal(
    summarizeEvChargers([charger("normal", 3.2, 2), charger("normal", 6, 1)]),
    "3.2kW×2, 6kW×1",
  );
});

test("未確認・無しは一覧に出さず、形の合わないデータは未確認にする", () => {
  assert.equal(summarizeEvChargers(null), null);
  assert.equal(summarizeEvChargers([]), null);
  assert.equal(parseEvChargers([{ kind: "quick" }]), null);
  assert.deepEqual(parseEvChargers([]), []);
});
