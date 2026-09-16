import assert from "node:assert/strict";
import test from "node:test";
import { fetchXProfile, parseXProfile } from "./xProfile";

const payload = {
  code: 200,
  user: {
    screen_name: "Yachiho_Ski",
    name: "八千穂高原スキー場【公式】",
    avatar_url: "https://pbs.twimg.com/profile_images/123/icon_normal.jpg",
  },
};

test("uses the matching account's display name and profile image", () => {
  assert.deepEqual(parseXProfile(payload, "yachiho_ski"), {
    name: payload.user.name,
    avatarUrl: payload.user.avatar_url,
  });
  assert.equal(parseXProfile(payload, "other"), null);
  assert.equal(parseXProfile({ ...payload, code: 404 }, "yachiho_ski"), null);
  assert.equal(parseXProfile({}, "yachiho_ski"), null);
});

test("keeps the name without allowing foreign or invalid image URLs", () => {
  for (const avatar_url of [
    null,
    "javascript:alert(1)",
    "https://pbs.twimg.com.evil.test/profile_images/a",
    "https://example.com/a",
    "https://pbs.twimg.com/other/a",
  ]) {
    assert.deepEqual(
      parseXProfile(
        { ...payload, user: { ...payload.user, avatar_url } },
        "yachiho_ski",
      ),
      {
        name: payload.user.name,
        avatarUrl: null,
      },
    );
  }
});

test("profile lookup caches valid responses and degrades safely on failures", async context => {
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async (
      url: string | URL | Request,
      options?: RequestInit & { next?: { revalidate: number } },
    ) => {
      assert.equal(url, "https://api.fxtwitter.com/2/profile/yachiho_ski");
      assert.equal(options?.next?.revalidate, 86400);
      assert.ok(options?.signal);
      return Response.json(payload);
    },
  );
  assert.equal((await fetchXProfile("Yachiho_Ski"))?.name, payload.user.name);
  assert.equal(await fetchXProfile("../other"), null);
  assert.equal(fetchMock.mock.callCount(), 1);
  fetchMock.mock.mockImplementation(
    async () => new Response(null, { status: 429 }),
  );
  assert.equal(await fetchXProfile("yachiho_ski"), null);
  fetchMock.mock.mockImplementation(async () => {
    throw new Error("timeout");
  });
  assert.equal(await fetchXProfile("yachiho_ski"), null);
  fetchMock.mock.mockImplementation(async () => new Response("not json"));
  assert.equal(await fetchXProfile("yachiho_ski"), null);
});
