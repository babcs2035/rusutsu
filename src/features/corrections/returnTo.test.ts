import assert from "node:assert/strict";
import test from "node:test";
import { safeCorrectionReturnTo } from "./returnTo";

test("return targets preserve the public origin state and never leave this site", () => {
  assert.equal(
    safeCorrectionReturnTo("/?resort=test&tab=map", "test"),
    "/?resort=test&tab=map",
  );
  assert.equal(
    safeCorrectionReturnTo("/rusutsu/test?tab=weather", "test"),
    "/test?tab=weather",
  );
  for (const value of [
    "https://external.example/",
    "//external.example/",
    "/admin",
    "/test-evil",
    "/\\external.example",
  ])
    assert.equal(safeCorrectionReturnTo(value, "test"), "/test");
});
