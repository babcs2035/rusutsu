import assert from "node:assert/strict";
import type { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";
import type { ActionResult } from "@/features/community/contract";

type TestApi = typeof import("@/features/community/actions") &
  typeof import("@/server/community/moderation") &
  typeof import("@/server/community/admin") &
  typeof import("@/lib/prisma") & {
    runtime: AsyncLocalStorage<{
      session: { user: { id: string } } | null;
      cookies: Map<string, string>;
    }>;
    photoGET: typeof import("@/app/api/community/photos/[photoId]/route").GET;
  };

const testDatabase = process.env.COMMUNITY_TEST_DATABASE_URL;
test("community: PostgreSQL authentication, independent reports, moderation, privacy and erasure", {
  skip: !testDatabase,
}, async () => {
  const url = new URL(testDatabase ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55501");
  assert.equal(url.pathname, "/postgres");
  process.env.DATABASE_URL = testDatabase;
  process.env.DATA_API_BASE_URL = "";
  delete process.env.OPENAI_API_KEY;
  const root = path.resolve("src/private/data/resorts-temporary/tmp/community");
  await fs.mkdir(root, { recursive: true });
  const outfile = path.join(root, "integration.mjs");
  await build({
    stdin: {
      contents: `export {runtime} from 'community-test-runtime'; export {prisma,disconnectPrisma} from '@/lib/prisma'; export * from '@/features/community/actions'; export * from '@/server/community/moderation'; export {normalizePhoto} from '@/server/community/photos'; export {GET as photoGET} from '@/app/api/community/photos/[photoId]/route'; export * from '@/server/community/admin';`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "isolated-request-runtime",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|community-test-runtime|next\/headers|next\/cache|next\/server|@\/auth|@\/lib\/finalizedResortGeojson)$/,
            },
            args => ({ path: args.path, namespace: "test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({
            loader: "js",
            contents:
              args.path === "server-only"
                ? "export {}"
                : args.path === "community-test-runtime"
                  ? `import {AsyncLocalStorage} from 'node:async_hooks'; export const runtime=new AsyncLocalStorage();`
                  : args.path === "@/auth"
                    ? `import {runtime} from 'community-test-runtime'; export async function auth(){return runtime.getStore()?.session ?? null;} export async function signIn(){} export async function signOut(){runtime.getStore().session=null;}`
                    : args.path === "next/headers"
                      ? `import {runtime} from 'community-test-runtime'; export async function headers(){return new Headers();} export async function cookies(){const store=runtime.getStore().cookies;return {get:key=>store.has(key)?{value:store.get(key)}:undefined,set:(key,value)=>store.set(key,value)};}`
                      : args.path === "next/cache"
                        ? `export function revalidatePath(){}`
                        : args.path === "next/server"
                          ? `export function after(){}`
                          : `export async function getFinalizedResortMapData(){return {courses:{features:[{groupId:'test-course-a',displayName:'A',coordinates:[[140,43],[140.01,43.01]]},{groupId:'test-course-b',displayName:'B',coordinates:[[140,43],[140.02,43.02]]}]}};}`,
          }));
        },
      },
    ],
  });
  const api = (await import(pathToFileURL(outfile).href)) as TestApi;
  const db = api.prisma;
  const prefix = `ct-${randomUUID().slice(0, 8)}`;
  const owner = `${prefix}-owner`,
    other = `${prefix}-other`,
    admin = `${prefix}-admin`,
    resortId = `${prefix}-resort`;
  const account = (id: string | null) => ({
    session: id ? { user: { id } } : null,
    cookies: new Map<string, string>(),
  });
  const a = account(owner),
    b = account(other),
    g = account(null),
    m = account(admin);
  const run = <T>(
    actor: ReturnType<typeof account>,
    fn: () => Promise<T>,
  ): Promise<T> => api.runtime.run(actor, fn);
  const report = (courseId: string | null, rating: number | null = 5) => ({
    kind: "REPORT",
    courseId,
    observedOn: "2026-01-10",
    rating,
    body: "雪がよかった",
    snowQualities: [],
    conditions: [],
  });
  const publish = (
    actor: ReturnType<typeof account>,
    entries: unknown[],
    photos = new FormData(),
    key = randomUUID(),
  ) =>
    run(actor, () =>
      api.publishPosts({ resortId, entries, idempotencyKey: key }, photos),
    );
  const assertSuccess = <T>(result: ActionResult<T>) => {
    assert.ok(result.ok, JSON.stringify(result));
    return result.data;
  };
  const assertFailure = (result: ActionResult<unknown>) =>
    assert.equal(result.ok, false);
  try {
    await db.user.createMany({
      data: [
        {
          id: owner,
          name: "Private Google Name",
          email: `${owner}@example.invalid`,
        },
        { id: other, name: "Other Private Name" },
        { id: admin, role: "admin" },
      ],
    });
    await db.skiResort.create({
      data: {
        id: resortId,
        nameJa: "投稿検証",
        nameEn: "Test",
        prefecture: "北海道",
        town: "検証",
        latitude: 43,
        longitude: 140,
        topElevation: 1000,
        baseElevation: 500,
        verticalDrop: 500,
        numberOfCourses: 2,
        longestCourse: 1000,
        beginnersCoursesPercent: 30,
        intermediateCoursesPercent: 40,
        advancedCoursesPercent: 30,
        courseImages: [],
        numberOfLifts: 1,
        ropeways: 0,
        gondolas: 0,
        quadLifts: 0,
        tripleLifts: 0,
        pairLifts: 1,
        singleLifts: 0,
        otherLifts: 0,
        sources: [],
        outlineImages: [],
      },
    });
    assertFailure(await publish(g, [report("test-course-a")]));
    assertFailure(await publish(a, [report("test-course-a")]));
    assertSuccess(
      await run(a, () => api.saveCommunityProfile("ANONYMOUS", "")),
    );
    assertSuccess(
      await run(b, () => api.saveCommunityProfile("NICKNAME", "雪だるま")),
    );
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "red" },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: "Private artist" } })
      .toBuffer();
    const upload = new FormData();
    upload.append(
      "photo:0",
      new File([new Uint8Array(image)], "private.jpg", { type: "image/jpeg" }),
    );
    const key = randomUUID();
    const batch = assertSuccess(
      await publish(
        a,
        [report("test-course-a"), report("test-course-b", 3)],
        upload,
        key,
      ),
    );
    assert.equal(batch.ids.length, 2);
    assert.notEqual(batch.ids[0], batch.ids[1]);
    assert.deepEqual(
      assertSuccess(
        await publish(
          a,
          [report("test-course-a"), report("test-course-b", 3)],
          upload,
          key,
        ),
      ).ids,
      batch.ids,
    );
    assert.equal(
      await db.communityPost.count({ where: { authorId: owner } }),
      2,
    );
    const feed = assertSuccess(
      await run(g, () =>
        api.getCommunityFeed({ resortId, courseId: "test-course-a" }),
      ),
    );
    assert.equal(feed.posts.length, 1);
    assert.equal(feed.posts[0].author.publicName, "匿名");
    assert.ok(!JSON.stringify(feed).includes("Private Google Name"));
    assert.ok(!JSON.stringify(feed).includes("@example.invalid"));
    const photoId = feed.posts[0].photos[0].id;
    const photo = await db.contributionPhoto.findUniqueOrThrow({
      where: { id: photoId },
    });
    const metadata = await sharp(Buffer.from(photo.bytes)).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.format, "webp");
    assert.equal(
      (
        await run(g, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId }),
          }),
        )
      ).status,
      200,
    );
    assertFailure(
      await run(b, () =>
        api.updatePost(
          batch.ids[0],
          1,
          report("test-course-a"),
          new FormData(),
          [],
        ),
      ),
    );
    assertFailure(await run(b, () => api.deletePost(batch.ids[0], 1)));
    assertSuccess(await run(b, () => api.setPostLike(batch.ids[0], true)));
    assertSuccess(await run(b, () => api.setPostLike(batch.ids[0], true)));
    assert.equal(
      await db.communityLike.count({ where: { postId: batch.ids[0] } }),
      1,
    );
    const commentKey = randomUUID();
    const comment = assertSuccess(
      await run(b, () =>
        api.saveComment(batch.ids[0], "よいですね", commentKey),
      ),
    );
    assert.equal(
      assertSuccess(
        await run(b, () =>
          api.saveComment(batch.ids[0], "よいですね", commentKey),
        ),
      ).id,
      comment.id,
    );
    assertFailure(
      await run(a, () =>
        api.saveComment(batch.ids[0], "他人の文", randomUUID(), comment.id, 1),
      ),
    );
    assertSuccess(
      await run(b, () =>
        api.saveComment(
          batch.ids[0],
          "編集しました",
          randomUUID(),
          comment.id,
          1,
        ),
      ),
    );
    assertFailure(await run(b, () => api.deleteComment(comment.id, 1)));
    assert.equal(
      assertSuccess(await run(a, () => api.getNotifications())).unreadCount,
      2,
    );
    assertSuccess(await run(a, () => api.markNotificationsRead()));
    assert.equal(
      assertSuccess(await run(a, () => api.getNotifications())).unreadCount,
      0,
    );
    assertSuccess(await publish(a, [report("test-course-a", 1)]));
    assertSuccess(await publish(a, [report("test-course-a", null)]));
    const ratings = assertSuccess(
      await run(g, () => api.getCommunityFeed({ resortId })),
    ).ratings;
    assert.equal(
      ratings.find(row => row.courseId === "test-course-a")?.average,
      1,
    );
    assert.equal(
      ratings.find(row => row.courseId === "test-course-a")?.count,
      1,
    );
    const mogul = {
      kind: "MOGUL",
      courseId: "test-course-a",
      observedOn: "2026-01-10",
      latitude: 43,
      longitude: 140,
      present: true,
    };
    const parent = assertSuccess(await publish(a, [mogul])).ids[0];
    const child = assertSuccess(
      await publish(b, [
        {
          ...mogul,
          parentId: parent,
          present: false,
          observedOn: "2026-01-11",
        },
      ]),
    ).ids[0];
    assert.equal(
      assertSuccess(await run(g, () => api.getPostDetail(parent))).history
        .length,
      2,
    );
    assertFailure(
      await publish(b, [
        { ...mogul, parentId: parent, longitude: 141, present: false },
      ]),
    );
    assertSuccess(
      await run(g, () =>
        api.reportCommunityContent(
          "POST",
          parent,
          "不適切な内容",
          "確認してください",
        ),
      ),
    );
    // A manually hidden photo is immediately inaccessible even to its author.
    const hiddenForm = new FormData();
    for (const [k, v] of Object.entries({
      targetKind: "POST",
      targetId: batch.ids[0],
      version: "1",
      decision: "HIDE",
    }))
      hiddenForm.set(k, v);
    await run(m, () => api.reviewCommunityContent(hiddenForm));
    assert.equal(
      (
        await run(g, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId }),
          }),
        )
      ).status,
      404,
    );
    assertFailure(await run(g, () => api.getPostDetail(batch.ids[0])));
    assert.equal(
      (
        await run(m, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId }),
          }),
        )
      ).status,
      200,
    );
    // Non-admin cannot restore hidden content; stale versions cannot be applied.
    await assert.rejects(run(b, () => api.reviewCommunityContent(hiddenForm)));
    hiddenForm.set("decision", "RESTORE");
    await assert.rejects(run(m, () => api.reviewCommunityContent(hiddenForm)));
    hiddenForm.set("version", "2");
    await run(m, () => api.reviewCommunityContent(hiddenForm));
    // Photo evidence belongs only to a private edit request, never its public author.
    const request = await db.editRequest.create({
      data: {
        authorId: "anonymous",
        authorName: "匿名",
        kind: "public-correction",
        resortId,
        submittedPayload: {},
        candidatePayload: {},
        submittedPlan: {},
        candidatePlan: {},
      },
    });
    const privatePhoto = await db.contributionPhoto.create({
      data: {
        requestId: request.id,
        bytes: photo.bytes,
        mimeType: "image/webp",
        width: 10,
        height: 10,
      },
    });
    assert.equal(
      (
        await run(g, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId: privatePhoto.id }),
          }),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await run(m, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId: privatePhoto.id }),
          }),
        )
      ).status,
      200,
    );
    // AI checks are versioned and cannot ban accounts. Mock the provider, no real API call.
    await db.communityModerationJob.updateMany({
      where: {
        targetId: {
          in: (
            await db.communityPost.findMany({
              where: { resortId },
              select: { id: true },
            })
          ).map(p => p.id),
        },
      },
      data: { status: "REVIEWED" },
    });
    const stale = await db.communityPost.create({
      data: {
        authorId: owner,
        resortId,
        kind: "REPORT",
        observedOn: "2026-01-10",
        batchKey: randomUUID(),
        batchIndex: 0,
        body: "new content",
        version: 2,
      },
    });
    await db.communityModerationJob.create({
      data: { targetKind: "POST", targetId: stale.id, targetVersion: 1 },
    });
    const toHide = await db.communityPost.create({
      data: {
        authorId: owner,
        resortId,
        kind: "REPORT",
        observedOn: "2026-01-10",
        batchKey: randomUUID(),
        batchIndex: 0,
      },
    });
    await db.communityModerationJob.create({
      data: { targetKind: "POST", targetId: toHide.id, targetVersion: 1 },
    });
    const originalFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
    globalThis.fetch = async input => {
      assert.equal(input, "https://api.openai.com/v1/moderations");
      return Response.json({
        results: [
          {
            flagged: true,
            categories: { harassment: true },
            category_scores: { harassment: 1 },
          },
        ],
      });
    };
    try {
      for (let pass = 0; pass < 10; pass++) await api.drainModerationJobs();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    }
    assert.equal(
      (await db.communityPost.findUniqueOrThrow({ where: { id: stale.id } }))
        .status,
      "VISIBLE",
    );
    assert.equal(
      (await db.communityPost.findUniqueOrThrow({ where: { id: toHide.id } }))
        .status,
      "HIDDEN",
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: owner } })).suspendedAt,
      null,
    );
    assertFailure(
      await run(a, () => api.deleteCommunityAccount("wrong" as never)),
    );
    assertSuccess(await run(a, () => api.deleteCommunityAccount("削除")));
    assert.equal(
      await db.communityPost.count({ where: { authorId: owner } }),
      0,
    );
    assert.equal(
      await db.contributionPhoto.count({ where: { ownerId: owner } }),
      0,
    );
    assert.equal(
      (
        await run(g, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId }),
          }),
        )
      ).status,
      404,
    );
    assert.equal(
      (await db.communityPost.findUniqueOrThrow({ where: { id: child } }))
        .parentId,
      null,
    );
    assert.equal(await db.editRequest.count({ where: { id: request.id } }), 1);
    assert.equal(
      await db.communityLike.count({
        where: { userId: other, postId: batch.ids[0] },
      }),
      0,
    );
  } finally {
    await db.communityReport.deleteMany({
      where: { targetId: { startsWith: prefix } },
    });
    await db.contributionPhoto.deleteMany({ where: { request: { resortId } } });
    await db.editRequest.deleteMany({ where: { resortId } });
    await db.skiResort.deleteMany({ where: { id: resortId } });
    await db.user.deleteMany({ where: { id: { in: [owner, other, admin] } } });
    await api.disconnectPrisma();
  }
});
