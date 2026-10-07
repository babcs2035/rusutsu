import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPublicMapPathname,
  resortIdFromPathname,
  resortIdFromUrl,
  resortPathname,
} from "./resortPath";

test("スキー場のパスと ID を相互に変換する", () => {
  assert.equal(
    resortPathname("shiga-kogen-central"),
    "/rusutsu/shiga-kogen-central",
  );
  assert.equal(resortPathname(null), "/rusutsu");
  assert.equal(
    resortIdFromPathname("/rusutsu/shiga-kogen-central/"),
    "shiga-kogen-central",
  );
  assert.equal(resortIdFromPathname("/rusutsu"), null);
  assert.equal(resortIdFromPathname("/rusutsu/a/b"), null);
});
test("管理画面などのページはスキー場として扱わない", () => {
  for (const path of ["/rusutsu/admin", "/rusutsu/login", "/rusutsu/api"]) {
    assert.equal(resortIdFromPathname(path), null);
    assert.equal(isPublicMapPathname(path), false);
  }
  assert.equal(isPublicMapPathname("/rusutsu/"), true);
  assert.equal(isPublicMapPathname("/rusutsu/niseko"), true);
});
test("旧形式の ?resort= も読む", () => {
  assert.equal(
    resortIdFromUrl(new URL("https://example.com/rusutsu?resort=niseko")),
    "niseko",
  );
});
