import assert from "node:assert/strict";
import type { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";
import type {
  ActionResult,
  ReportDraft,
  ReportEntryDraft,
} from "@/features/community/contract";
import { verifyRemoteCommunity } from "./remoteIntegration";

type TestApi = typeof import("@/features/community/actions") &
  typeof import("@/server/community/moderation") &
  typeof import("@/server/community/admin") &
  typeof import("@/server/community/photos") &
  typeof import("@/lib/prisma") & {
    runtime: AsyncLocalStorage<{
      session: { user: { id: string } } | null;
      cookies: Map<string, string>;
    }>;
    photoGET: typeof import("@/app/api/community/photos/[photoId]/route").GET;
    internalCommunityPOST: typeof import("@/app/api/internal/v1/community/route").POST;
  };

const testDatabase = process.env.COMMUNITY_TEST_DATABASE_URL;
test("community reports: atomic daily report lifecycle and privacy", {
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
      contents: `export {runtime} from 'community-test-runtime'; export {prisma,disconnectPrisma} from '@/lib/prisma'; export * from '@/features/community/actions'; export * from '@/server/community/moderation'; export {normalizePhoto} from '@/server/community/photos'; export {GET as photoGET} from '@/app/api/community/photos/[photoId]/route'; export {POST as internalCommunityPOST} from '@/app/api/internal/v1/community/route'; export * from '@/server/community/admin';`,
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
                /^(server-only|community-test-runtime|next\/headers|next\/cache|next\/server|@\/auth|@\/lib\/finalizedResortGeojson|@\/lib\/skiResortData)$/,
            },
            args => ({ path: args.path, namespace: "test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents:
              args.path === "server-only"
                ? "export {}"
                : args.path === "@/lib/skiResortData"
                  ? `import {prisma} from '@/lib/prisma'; export async function readSkiResortById(id){const resort=await prisma.skiResort.findFirst({where:{id,isActive:true},select:{id:true,nameJa:true,longitude:true,latitude:true}});return resort&&{...resort,linkedArea:null};}`
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
                            : `export async function getFinalizedResortMapData(){return {courses:{features:[{groupId:'test-course-a',displayName:'A',coordinates:[[140,43],[140.01,43.01]]},{groupId:'test-course-b',displayName:'B',coordinates:[[140,43],[140.02,43.02]]}]},lifts:{features:[{id:'test-lift-a',name:'第1リフト',coordinates:[[140,43],[140.005,43.005]]}]}};}`,
          }));
        },
      },
    ],
  });
  const api = (await import(pathToFileURL(outfile).href)) as TestApi;
  const db = api.prisma;
  const prefix = `ct-${randomUUID().slice(0, 8)}`;
  const owner = `${prefix}-owner`;
  const other = `${prefix}-other`;
  const admin = `${prefix}-admin`;
  const resortId = `${prefix}-resort`;
  const account = (id: string | null) => ({
    session: id ? { user: { id } } : null,
    cookies: new Map<string, string>(),
  });
  const a = account(owner),
    b = account(other),
    g = account(null),
    m = account(admin);
  const run = <T>(actor: ReturnType<typeof account>, fn: () => Promise<T>) =>
    api.runtime.run(actor, fn);
  const course = (key: string, courseId: string): ReportEntryDraft => ({
    clientKey: key,
    kind: "COURSE",
    courseId,
    liftId: null,
    body: `${courseId} の雪は良好`,
    snowQualities: ["パウダー（軽い）"],
    status: "積雪不足",
    crowding: "普通",
    latitude: 43.005,
    longitude: 140.005,
    itemType: null,
    size: null,
    waitMinutes: null,
    liftSpeed: null,
    liftSpeedLevel: null,
    depth: null,
  });
  const lift = (key: string): ReportEntryDraft => ({
    clientKey: key,
    kind: "LIFT",
    courseId: null,
    liftId: "test-lift-a",
    body: "待ち時間は短め",
    snowQualities: [],
    status: "減速中",
    crowding: null,
    latitude: null,
    longitude: null,
    itemType: null,
    size: null,
    waitMinutes: 5,
    liftSpeed: 2.3,
    liftSpeedLevel: "遅い",
    depth: null,
  });
  const mogul = (key: string): ReportEntryDraft => ({
    clientKey: key,
    kind: "MOGUL",
    courseId: "test-course-a",
    liftId: null,
    body: "コブは柔らかい",
    snowQualities: ["柔らかめ"],
    status: null,
    crowding: null,
    latitude: 43.001,
    longitude: 140.001,
    itemType: null,
    size: null,
    waitMinutes: null,
    liftSpeed: null,
    liftSpeedLevel: null,
    depth: "深い",
  });
  const item = (key: string): ReportEntryDraft => ({
    clientKey: key,
    kind: "ITEM",
    courseId: "test-course-b",
    liftId: null,
    body: "キッカーあり",
    snowQualities: [],
    status: null,
    crowding: null,
    latitude: 43.02,
    longitude: 140.02,
    itemType: "キッカー",
    size: "中",
    waitMinutes: null,
    liftSpeed: null,
    liftSpeedLevel: null,
    depth: null,
  });
  const draft = (entry: ReportEntryDraft): ReportDraft => ({
    observedOn: "2026-01-10",
    observedTime: "10:35",
    entries: [entry],
  });
  const photoForm = (entryKey: string, image: Buffer, name: string) => {
    const form = new FormData();
    form.append(
      `photos:${entryKey}`,
      new File([new Uint8Array(image)], name, { type: "image/jpeg" }),
    );
    return form;
  };
  const publish = (
    actor: ReturnType<typeof account>,
    report: ReportDraft,
    photos = new FormData(),
    idempotencyKey = randomUUID(),
  ) =>
    run(actor, () =>
      api.publishReport({ resortId, report, idempotencyKey }, photos),
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
    assertFailure(
      await publish(g, draft(course(randomUUID(), "test-course-a"))),
    );
    assertFailure(
      await publish(a, draft(course(randomUUID(), "test-course-a"))),
    );
    assertSuccess(
      await run(a, () => api.saveCommunityProfile("ANONYMOUS", "")),
    );
    assertSuccess(
      await run(b, () => api.saveCommunityProfile("NICKNAME", "雪だるま")),
    );

    const heicFixture = process.env.COMMUNITY_HEIC_TEST_FILE;
    if (heicFixture) {
      const original = await fs.readFile(heicFixture);
      const heic = new File([original], "sample.heic", { type: "image/heic" });
      const normalized = await api.normalizePhoto(heic);
      const meta = await sharp(normalized.bytes).metadata();
      assert.equal(meta.format, "webp");
      assert.equal(meta.exif, undefined);
      assert.ok(normalized.width <= 2048 && normalized.height <= 2048);
      const form = new FormData();
      form.set("photo", heic);
      const prepared = assertSuccess(
        await run(a, () => api.prepareCommunityPhoto(form)),
      );
      assert.equal(prepared.mimeType, "image/webp");
      assert.equal(
        (await sharp(Buffer.from(prepared.base64, "base64")).metadata()).format,
        "webp",
      );
    }
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "red" },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: "Private artist" } })
      .toBuffer();
    // 1件の投稿は1項目。写真はその項目に付く。
    const courseKey = randomUUID();
    const report = draft(course(courseKey, "test-course-a"));
    const upload = photoForm(courseKey, image, "private.jpg");
    const key = randomUUID();
    const created = assertSuccess(await publish(a, report, upload, key));
    assert.equal(typeof created.id, "string");
    assert.equal(
      assertSuccess(await publish(a, report, upload, key)).id,
      created.id,
    );
    assert.equal(
      await db.communityPost.count({ where: { authorId: owner } }),
      1,
    );
    assert.equal(
      await db.communityEntry.count({ where: { postId: created.id } }),
      1,
    );
    // 項目に紐づかない写真や、ほかの項目宛ての写真は受け付けない
    const loosePhoto = new FormData();
    loosePhoto.append(
      "photos",
      new File([new Uint8Array(image)], "loose.jpg", { type: "image/jpeg" }),
    );
    assertFailure(
      await publish(
        a,
        draft(course(randomUUID(), "test-course-a")),
        loosePhoto,
      ),
    );
    assertFailure(
      await publish(
        a,
        draft(course(randomUUID(), "test-course-a")),
        photoForm(randomUUID(), image, "other.jpg"),
      ),
    );

    const single = assertSuccess(await publish(a, draft(lift(randomUUID()))));
    const singleFeed = assertSuccess(
      await run(g, () => api.getCommunityFeed({ resortId, kind: "LIFT" })),
    );
    const singlePost = singleFeed.posts.find(post => post.id === single.id);
    assert.equal(singlePost?.observedTime, "10:35");
    assert.equal(singlePost?.entries.length, 1);
    assert.equal(singlePost?.entries[0].status, "減速中");
    assert.equal(singlePost?.entries[0].liftSpeed, 2.3);
    assert.equal(
      assertSuccess(
        await run(g, () =>
          api.getCommunityFeed({ resortId, liftId: "test-lift-a" }),
        ),
      ).posts[0].id,
      single.id,
    );
    assertSuccess(
      await run(a, async () => {
        const detail = assertSuccess(await api.getPostDetail(single.id));
        return api.deletePost(single.id, detail.post.version);
      }),
    );

    const feed = assertSuccess(
      await run(g, () =>
        api.getCommunityFeed({ resortId, courseId: "test-course-a" }),
      ),
    );
    assert.equal(feed.posts.length, 1);
    assert.equal(feed.posts[0].id, created.id);
    assert.equal(feed.posts[0].entries.length, 1);
    assert.equal(feed.posts[0].author.publicName, "匿名");
    assert.ok(!JSON.stringify(feed).includes("Private Google Name"));
    assert.ok(!JSON.stringify(feed).includes("@example.invalid"));
    const detail = assertSuccess(
      await run(g, () => api.getPostDetail(created.id)),
    );
    assert.equal(detail.post.entries.length, 1);
    assert.ok(!("history" in detail));
    const photoId = detail.post.entries[0].photos[0].id;
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

    const beforeInvalid = await db.communityPost.count({
      where: { authorId: owner },
    });
    const invalid = draft(course(randomUUID(), "missing-course"));
    assertFailure(await publish(a, invalid));
    assert.equal(
      await db.communityPost.count({ where: { authorId: owner } }),
      beforeInvalid,
    );
    const invalidLift = draft({
      ...lift(randomUUID()),
      liftId: "missing-lift",
    });
    assertFailure(await publish(a, invalidLift));
    assert.equal(
      await db.communityPost.count({ where: { authorId: owner } }),
      beforeInvalid,
    );

    assertFailure(
      await run(b, () =>
        api.updateReport(created.id, 1, report, new FormData(), []),
      ),
    );
    assertFailure(await run(b, () => api.deletePost(created.id, 1)));
    assertSuccess(await run(b, () => api.setPostLike(created.id, true)));
    assertSuccess(await run(b, () => api.setPostLike(created.id, true)));
    assert.equal(
      await db.communityLike.count({ where: { postId: created.id } }),
      1,
    );
    const commentKey = randomUUID();
    const comment = assertSuccess(
      await run(b, () => api.saveComment(created.id, "よいですね", commentKey)),
    );
    assert.equal(
      assertSuccess(
        await run(b, () =>
          api.saveComment(created.id, "よいですね", commentKey),
        ),
      ).id,
      comment.id,
    );
    assertFailure(
      await run(a, () =>
        api.saveComment(created.id, "他人の編集", randomUUID(), comment.id, 1),
      ),
    );
    assertSuccess(
      await run(b, () =>
        api.saveComment(
          created.id,
          "編集しました",
          randomUUID(),
          comment.id,
          1,
        ),
      ),
    );
    assertFailure(await run(b, () => api.deleteComment(comment.id, 1)));
    assertSuccess(
      await run(g, () =>
        api.reportCommunityContent(
          "POST",
          created.id,
          "不適切な内容",
          "確認してください",
        ),
      ),
    );

    // 編集は項目をその場で書き換え、残した写真の紐づけを保つ
    const entryBefore = await db.communityEntry.findFirstOrThrow({
      where: { postId: created.id },
    });
    const revised = draft({
      ...course(courseKey, "test-course-b"),
      status: "クローズ",
      body: "部分編集後",
    });
    const updated = assertSuccess(
      await run(a, () =>
        api.updateReport(created.id, 1, revised, new FormData(), [photoId]),
      ),
    );
    assert.equal(updated.id, created.id);
    assertFailure(
      await run(a, () =>
        api.updateReport(created.id, 1, revised, new FormData(), []),
      ),
    );
    const entryAfter = await db.communityEntry.findFirstOrThrow({
      where: { postId: created.id },
    });
    assert.equal(entryAfter.id, entryBefore.id);
    assert.equal(entryAfter.courseId, "test-course-b");
    assert.equal(entryAfter.status, "クローズ");
    assert.equal(
      await db.contributionPhoto.count({ where: { postId: created.id } }),
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

    const mapEntries = assertSuccess(
      await run(g, () =>
        api.getCommunityMapEntries({ resortId, kind: "MOGUL" }),
      ),
    );
    assert.equal(mapEntries.entries.length, 0);
    const withPoint = draft(mogul(randomUUID()));
    const pointPost = assertSuccess(await publish(a, withPoint));
    const points = assertSuccess(
      await run(g, () =>
        api.getCommunityMapEntries({ resortId, kind: "MOGUL" }),
      ),
    );
    assert.equal(points.entries.length, 1);
    assert.equal(points.entries[0].postId, pointPost.id);
    assert.equal(
      (
        await db.communityEntry.findFirstOrThrow({
          where: { postId: pointPost.id },
        })
      ).depth,
      "深い",
    );

    // AI receives the item text, then hides the whole report.
    const itemKey = randomUUID();
    const flagged = draft(item(itemKey));
    const flaggedPhotos = photoForm(itemKey, image, "flagged.jpg");
    const flaggedResult = assertSuccess(
      await publish(a, flagged, flaggedPhotos),
    );
    const flaggedDetail = assertSuccess(
      await run(g, () => api.getPostDetail(flaggedResult.id)),
    );
    const flaggedPhotoId = flaggedDetail.post.entries[0].photos[0].id;
    await db.communityModerationJob.updateMany({
      where: { targetKind: "POST", targetId: { not: flaggedResult.id } },
      data: { status: "REVIEWED" },
    });
    const originalFetch = globalThis.fetch;
    let moderationRequest = "";
    process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "https://api.openai.com/v1/moderations");
      moderationRequest = String(init?.body);
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
    const sent = await db.communityModerationJob.findFirst({
      where: { targetId: flaggedResult.id },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(sent);
    assert.equal(
      (
        await db.communityPost.findUniqueOrThrow({
          where: { id: flaggedResult.id },
        })
      ).status,
      "HIDDEN",
    );
    assertFailure(await run(g, () => api.getPostDetail(flaggedResult.id)));
    assert.ok(moderationRequest.includes("キッカーあり"));
    assert.equal(
      (
        await run(g, () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId: flaggedPhotoId }),
          }),
        )
      ).status,
      404,
    );

    const hideForm = new FormData();
    for (const [k, v] of Object.entries({
      targetKind: "POST",
      targetId: created.id,
      version: "2",
      decision: "HIDE",
    }))
      hideForm.set(k, v);
    await run(m, () => api.reviewCommunityContent(hideForm));
    assertFailure(await run(g, () => api.getPostDetail(created.id)));
    await assert.rejects(run(b, () => api.reviewCommunityContent(hideForm)));
    hideForm.set("version", "3");
    hideForm.set("decision", "RESTORE");
    await run(m, () => api.reviewCommunityContent(hideForm));
    assert.equal(
      assertSuccess(await run(g, () => api.getPostDetail(created.id))).post.id,
      created.id,
    );

    assertFailure(
      await run(a, () => api.deleteCommunityAccount("wrong" as never)),
    );
    await verifyRemoteCommunity(api, root, testDatabase as string, {
      resortId,
      owner,
      other,
      admin,
    });
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
      await db.communityLike.count({
        where: { userId: other, postId: created.id },
      }),
      0,
    );
    assert.equal(
      await db.communityComment.count({
        where: { authorId: other, postId: created.id },
      }),
      0,
    );
    assert.equal(await db.editRequest.count({ where: { resortId } }), 0);
  } finally {
    const postIds = (
      await db.communityPost.findMany({
        where: { resortId },
        select: { id: true },
      })
    ).map(row => row.id);
    const commentIds = (
      await db.communityComment.findMany({
        where: { post: { resortId } },
        select: { id: true },
      })
    ).map(row => row.id);
    await db.communityReport.deleteMany({
      where: {
        OR: [
          { targetKind: "POST", targetId: { in: postIds } },
          { targetKind: "COMMENT", targetId: { in: commentIds } },
        ],
      },
    });
    await db.skiResort.deleteMany({ where: { id: resortId } });
    await db.user.deleteMany({ where: { id: { in: [owner, other, admin] } } });
    await api.disconnectPrisma();
  }
});
