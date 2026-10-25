import assert from "node:assert/strict";
import test from "node:test";
import { privateModerationEndpoint } from "./moderationEndpoint";

test("photos may be checked by a site-internal service only", () => {
  assert.equal(privateModerationEndpoint(undefined), null);
  for (const url of [
    "http://127.0.0.1:8080/moderate",
    "http://moderation:8080/v1/moderations",
    "http://10.1.2.3/check",
  ])
    assert.equal(privateModerationEndpoint(url), url);
  for (const url of [
    "https://api.openai.com/v1/moderations",
    "https://10.external.example/photos",
    "file:///photos",
    "http://127.0.0.1@external.example/upload",
    "http://user:password@localhost/check",
  ])
    assert.throws(() => privateModerationEndpoint(url));
});
