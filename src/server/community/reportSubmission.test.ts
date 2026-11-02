import assert from "node:assert/strict";
import test from "node:test";
import type { ReportDraft } from "@/features/community/contract";
import type { ReportSubmission } from "@/features/community/submitReport";
import { MAX_MULTIPART_BYTES } from "./remoteContract";
import { handleReportSubmission } from "./reportSubmission";

const report: ReportDraft = {
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
};

const publish: ReportSubmission = {
  operation: "publish",
  input: {
    resortId: "resort-a",
    report,
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  },
};
const update: ReportSubmission = {
  operation: "update",
  input: {
    postId: "post-a",
    version: 2,
    report,
    removePhotoIds: ["photo-old"],
  },
};

function multipartRequest(command: ReportSubmission) {
  const form = new FormData();
  form.set("command", JSON.stringify(command));
  form.append("photo-0", new Blob(["photo-bytes"]), "photo.jpg");
  return new Request("http://localhost/rusutsu/api/community/report", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "x-community-request": "1",
      "sec-fetch-site": "same-origin",
    },
    body: form,
  });
}

const responseBody = (response: Response) => response.json();

test("rejects cross-site, missing custom header, and unauthenticated requests before execute", async () => {
  let executeCalls = 0;
  const deps = {
    authenticate: async () => false,
    execute: async () => {
      executeCalls++;
      return { ok: true as const, data: { id: "post-a" } };
    },
  };
  const crossSite = multipartRequest(publish);
  crossSite.headers.set("origin", "https://attacker.example");
  crossSite.headers.set("sec-fetch-site", "cross-site");
  const noCustomHeader = multipartRequest(publish);
  noCustomHeader.headers.delete("x-community-request");
  const unauthenticated = multipartRequest(publish);

  assert.equal((await handleReportSubmission(crossSite, deps)).status, 403);
  assert.equal(
    (await handleReportSubmission(noCustomHeader, deps)).status,
    403,
  );
  assert.equal(
    (await handleReportSubmission(unauthenticated, deps)).status,
    401,
  );
  assert.equal(executeCalls, 0);
});

test("dispatches publish and update with photos separated from command fields", async () => {
  const calls: { command: ReportSubmission; photoNames: string[] }[] = [];
  const deps = {
    authenticate: async () => true,
    execute: async (command: ReportSubmission, photos: FormData) => {
      calls.push({ command, photoNames: [...photos.keys()] });
      return { ok: true as const, data: { id: "post-a" } };
    },
  };

  const publishResponse = await handleReportSubmission(
    multipartRequest(publish),
    deps,
  );
  const updateResponse = await handleReportSubmission(
    multipartRequest(update),
    deps,
  );
  assert.equal(publishResponse.status, 200);
  assert.equal(updateResponse.status, 200);
  assert.equal(calls[0]?.command.operation, "publish");
  assert.equal(calls[1]?.command.operation, "update");
  assert.deepEqual(calls[0]?.photoNames, ["photo-0"]);
  assert.deepEqual(calls[1]?.photoNames, ["photo-0"]);
  assert.deepEqual(await responseBody(publishResponse), {
    ok: true,
    data: { id: "post-a" },
  });
});

test("accepts the configured public origin behind a proxy and rejects a spoofed forwarded host", async () => {
  const deps = {
    publicOrigin: "https://ktak.dev/rusutsu",
    authenticate: async () => true,
    execute: async () => ({ ok: true as const, data: { id: "post-a" } }),
  };
  const proxied = multipartRequest(publish);
  proxied.headers.set("origin", "https://ktak.dev");
  proxied.headers.set("host", "127.0.0.1:3000");
  assert.equal((await handleReportSubmission(proxied, deps)).status, 200);
  const forged = multipartRequest(publish);
  forged.headers.set("origin", "https://attacker.example");
  forged.headers.set("x-forwarded-host", "attacker.example");
  assert.equal((await handleReportSubmission(forged, deps)).status, 403);
});

test("enforces the multipart byte limit before dispatch", async () => {
  let executeCalls = 0;
  const request = new Request("http://localhost/rusutsu/api/community/report", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "x-community-request": "1",
      "content-type": "multipart/form-data; boundary=test",
      "content-length": String(MAX_MULTIPART_BYTES + 1),
    },
  });
  const response = await handleReportSubmission(request, {
    authenticate: async () => true,
    execute: async () => {
      executeCalls++;
      return { ok: true, data: { id: "post-a" } };
    },
  });
  assert.equal(response.status, 413);
  assert.equal(executeCalls, 0);
});
