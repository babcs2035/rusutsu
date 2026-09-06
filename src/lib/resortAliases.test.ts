import assert from "node:assert/strict";
import { test } from "node:test";
import { getResortLabelName, getResortSearchName } from "./resortAliases";

test("DB shortName controls labels and searches with the existing name fallback", () => {
  assert.equal(
    getResortLabelName("rusutsu-resort", "ルスツリゾートスキー場", " ルスツ "),
    "ルスツ",
  );
  assert.equal(
    getResortSearchName("example", "正式名スキー場", null),
    "正式名スキー場",
  );
  assert.equal(getResortLabelName("example", "正式名スキー場", null), "正式名");
  assert.equal(getResortLabelName("example", "スキー場", " "), "スキー場");
  assert.equal(getResortLabelName("example", "", null), "example");
});
