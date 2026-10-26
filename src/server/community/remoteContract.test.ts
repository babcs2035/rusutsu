import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_COMMAND_JSON_BYTES,
  MAX_MULTIPART_BYTES,
  requestSchema,
  successPayloadSchemas,
} from "./remoteContract";

const course = {
  clientKey: "00000000-0000-4000-8000-000000000001",
  kind: "COURSE",
  status: "オープン",
  courseId: "course-1",
  liftId: null,
  body: "整備されています",
  snowQualities: ["柔らかめ"],
  crowding: "普通",
  latitude: null,
  longitude: null,
  itemType: null,
  size: null,
  waitMinutes: null,
};
const mogul = {
  clientKey: "00000000-0000-4000-8000-000000000002",
  kind: "MOGUL",
  courseId: null,
  liftId: null,
  body: "コブあり",
  snowQualities: ["硬め"],
  latitude: 43.5,
  longitude: 142.8,
  depth: "深い",
};
const report = {
  observedOn: "2026-10-25",
  observedTime: "10:35",
  entries: [course],
};

const validRequest = {
  command: {
    operation: "publish",
    input: {
      resortId: "resort-1",
      report,
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    },
  },
  googleAccountId: "google-account-1",
};

test("request rejects caller supplied identity or role fields", () => {
  assert.equal(requestSchema.safeParse(validRequest).success, true);
  for (const extra of [
    { userId: "forged-user" },
    { role: "admin" },
    { authorId: "forged-author" },
  ]) {
    assert.equal(
      requestSchema.safeParse({ ...validRequest, ...extra }).success,
      false,
    );
  }
  assert.equal(
    requestSchema.safeParse({
      ...validRequest,
      command: { ...validRequest.command, userId: "forged-user" },
    }).success,
    false,
  );
});

test("request rejects unknown fields and accepts each report entry kind", () => {
  assert.equal(
    requestSchema.safeParse({
      ...validRequest,
      unexpected: true,
    }).success,
    false,
  );
  assert.equal(requestSchema.safeParse(validRequest).success, true);
  assert.equal(
    requestSchema.safeParse(withReport({ entries: [mogul] })).success,
    true,
  );
});

const withReport = (patch: Record<string, unknown>) => ({
  ...validRequest,
  command: {
    ...validRequest.command,
    input: {
      ...validRequest.command.input,
      report: { ...report, ...patch },
    },
  },
});

test("report carries one item and rejects old multi-item fields", () => {
  for (const patch of [
    { entries: [course, mogul] },
    { entries: [] },
    { entries: [{ ...mogul, latitude: null }] },
    { entries: [{ ...course, status: null }] },
    { observedTime: null },
    { body: "全体の感想" },
    { rating: 4 },
  ])
    assert.equal(
      requestSchema.safeParse(withReport(patch)).success,
      false,
      JSON.stringify(patch),
    );
});

test("command size limits allow the stated multipart envelope", () => {
  assert.equal(MAX_COMMAND_JSON_BYTES, 1024 * 1024);
  assert.equal(MAX_MULTIPART_BYTES, 49 * 1024 * 1024);
  assert.ok(MAX_MULTIPART_BYTES > 6 * 8 * 1024 * 1024);
});

test("feed and map entries response schemas require their wrapper shapes", () => {
  const feed = successPayloadSchemas.feed;
  const mapEntries = successPayloadSchemas.mapEntries;
  assert.equal(
    feed.safeParse({ posts: [], viewerId: null, nextCursor: null }).success,
    true,
  );
  assert.equal(feed.safeParse([]).success, false);
  assert.equal(
    feed.safeParse({
      posts: [{}],
      viewerId: null,
      nextCursor: null,
    }).success,
    false,
  );
  assert.equal(
    mapEntries.safeParse({ entries: [], nextCursor: null }).success,
    true,
  );
  assert.equal(mapEntries.safeParse([]).success, false);
  assert.equal(
    mapEntries.safeParse({ entries: [{ id: "incomplete" }], nextCursor: null })
      .success,
    false,
  );
});

test("public report entries require their attached photo list", () => {
  const post = {
    observedOn: "2026-10-25",
    observedTime: "10:35",
    entries: [
      {
        ...course,
        id: "entry-1",
        targetName: "Course",
        photos: [{ id: "photo-1", width: 10, height: 20 }],
      },
    ],
    id: "post-1",
    resortId: "resort-1",
    resortName: "Resort",
    version: 1,
    author: { id: "author-1", publicName: "Author" },
    createdAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:00.000Z",
    likeCount: 0,
    commentCount: 0,
    liked: false,
  };
  const feed = {
    posts: [post],
    viewerId: null,
    nextCursor: null,
  };
  assert.equal(successPayloadSchemas.feed.safeParse(feed).success, true);
  const missingPhotos = structuredClone(feed);
  delete (missingPhotos.posts[0].entries[0] as { photos?: unknown }).photos;
  assert.equal(
    successPayloadSchemas.feed.safeParse(missingPhotos).success,
    false,
  );
});
