import assert from "node:assert/strict";
import test from "node:test";
import type { ReportSubmission } from "./submitReport";
import { submitReport } from "./submitReport";

const command: ReportSubmission = {
  operation: "publish",
  input: {
    resortId: "resort-a",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    report: {
      observedOn: "2026-01-10",
      observedTime: "10:00",
      entries: [
        {
          clientKey: "00000000-0000-4000-8000-000000000002",
          kind: "COURSE",
          courseId: "course-a",
          liftId: null,
          body: "",
          snowQualities: [],
          status: "オープン",
          crowding: null,
          latitude: null,
          longitude: null,
          itemType: null,
          size: null,
          waitMinutes: null,
          liftSpeed: null,
          liftSpeedLevel: null,
          depth: null,
        },
      ],
    },
  },
};

const photos = new FormData();
photos.append("photo-0", new Blob(["photo"]), "photo.jpg");

test("returns an HTTP rejection without waiting for its unfinished HTML body", async () => {
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>blocked"));
      },
    }),
    { status: 403, headers: { "content-type": "text/html" } },
  );
  const result = await Promise.race([
    submitReport(command, photos, { fetch: async () => response }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("waited for response body")), 100),
    ),
  ]);
  assert.deepEqual(result, {
    ok: false,
    error:
      "投稿が送信先で拒否されました。入力内容は残っています。時間を置いてもう一度お試しください。",
  });
});

test("maps an oversized response status to its actionable message", async () => {
  const result = await submitReport(command, photos, {
    fetch: async () => new Response("too large", { status: 413 }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /データが大きすぎます/u);
});

test("reports a short request timeout distinctly", async () => {
  const result = await submitReport(command, photos, {
    timeoutMs: 20,
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          {
            once: true,
          },
        );
      }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /時間がかかっています/u);
});

test("distinguishes network and unexpected JSON failures", async () => {
  const network = await submitReport(command, photos, {
    fetch: async () => {
      throw new Error("offline");
    },
  });
  const unexpected = await submitReport(command, photos, {
    fetch: async () => Response.json({ success: true }),
  });
  assert.equal(network.ok, false);
  assert.equal(unexpected.ok, false);
  if (!network.ok) assert.match(network.error, /受け取れませんでした/u);
  if (!unexpected.ok)
    assert.match(unexpected.error, /送信結果を確認できませんでした/u);
});

test("preserves business errors and returns a confirmed success id", async () => {
  const businessError = await submitReport(command, photos, {
    fetch: async () =>
      Response.json({ ok: false, error: "同時編集されています。" }),
  });
  const success = await submitReport(command, photos, {
    fetch: async () => Response.json({ ok: true, data: { id: "post-a" } }),
  });
  assert.deepEqual(businessError, {
    ok: false,
    error: "同時編集されています。",
  });
  assert.deepEqual(success, { ok: true, data: { id: "post-a" } });
});
