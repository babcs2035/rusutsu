import assert from "node:assert/strict";
import type { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";
import type { SubmitCorrectionInput } from "@/server/corrections/contract";

type TestActor = {
  userId: string | null;
  actor: {
    id: string;
    role: string;
    name: string;
    email: null;
    image: null;
  } | null;
  cookies: Map<string, string>;
};

type TestApi = typeof import("@/features/corrections/actions") &
  typeof import("@/lib/prisma") & {
    runtime: AsyncLocalStorage<TestActor>;
    photoGET: typeof import("@/app/api/community/photos/[photoId]/route").GET;
  } & typeof import("@/server/data-documents/repositoryCore");

type TestFeatureCollection = {
  features: Array<{
    properties: Record<string, unknown>;
    geometry: { coordinates: unknown };
  }>;
};

type CandidateCorrectionPayload = {
  items: Array<{ decision?: string }>;
};

const databaseUrl = process.env.CORRECTIONS_TEST_DATABASE_URL;
test("anonymous corrections: PostgreSQL idempotency, review CAS, geometry, bulk and private photos", {
  skip: !databaseUrl,
}, async () => {
  const url = new URL(databaseUrl ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55501");
  assert.equal(url.pathname, "/postgres");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATA_API_BASE_URL = "";
  process.env.ALLOW_BUNDLED_DATA_FIXTURES = "false";
  const root = path.resolve(
    "src/private/data/resorts-temporary/tmp/corrections",
  );
  await fs.mkdir(root, { recursive: true });
  const outfile = path.join(root, "integration.mjs");
  await build({
    stdin: {
      contents: `export {runtime} from 'corrections-test-runtime'; export {prisma,disconnectPrisma} from '@/lib/prisma'; export {submitCorrection,decideCorrectionItem,adjustCorrectionItem} from '@/features/corrections/actions'; export {hashDataDocumentContent} from '@/server/data-documents/repositoryCore'; export {GET as photoGET} from '@/app/api/community/photos/[photoId]/route';`,
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
        name: "isolated-corrections-runtime",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|corrections-test-runtime|next\/headers|next\/cache|next\/server|@\/auth|@\/lib\/requireEditor)$/,
            },
            args => ({ path: args.path, namespace: "corrections-test" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "corrections-test" },
            args => ({
              loader: "js",
              contents:
                args.path === "server-only"
                  ? "export {};"
                  : args.path === "corrections-test-runtime"
                    ? "import {AsyncLocalStorage} from 'node:async_hooks'; export const runtime=new AsyncLocalStorage();"
                    : args.path === "next/headers"
                      ? "import {runtime} from 'corrections-test-runtime'; export async function headers(){return new Headers();} export async function cookies(){const jar=runtime.getStore().cookies;return {get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,value)=>jar.set(key,value)};}"
                      : args.path === "next/cache"
                        ? "export function revalidatePath(){}"
                        : args.path === "next/server"
                          ? "export function after(){}"
                          : args.path === "@/auth"
                            ? "import {runtime} from 'corrections-test-runtime'; export async function auth(){const id=runtime.getStore()?.userId;return id?{user:{id}}:null;}"
                            : `import {runtime} from 'corrections-test-runtime'; export async function getCurrentActor(){return runtime.getStore()?.actor ?? null;}`,
            }),
          );
        },
      },
    ],
  });
  const api = (await import(pathToFileURL(outfile).href)) as TestApi;
  const db = api.prisma;
  const prefix = `corr-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const resortId = `${prefix}-resort`,
    adminId = `${prefix}-admin`,
    editorId = `${prefix}-editor`;
  const actor = (userId: string | null) => ({
    userId,
    actor: userId
      ? {
          id: userId,
          role: userId === adminId ? "admin" : "editor",
          name: userId,
          email: null,
          image: null,
        }
      : null,
    cookies: new Map<string, string>(),
  });
  const run = <T>(session: TestActor, fn: () => Promise<T>): Promise<T> =>
    api.runtime.run(session, fn);
  const anonymous = () => actor(null);
  const submit = (
    items: SubmitCorrectionInput["items"],
    session = anonymous(),
    operationKey = randomUUID(),
    photos = new FormData(),
  ) =>
    run(session, () =>
      api.submitCorrection(
        { operationKey, resortId, items, returnTo: `/${resortId}` },
        photos,
      ),
    );
  const line = (
    id: string,
    coordinates: number[][],
    properties: Record<string, unknown>,
  ) => ({
    type: "Feature",
    properties: { entityId: id, ...properties },
    geometry: { type: "LineString", coordinates },
  });
  const documents = [
    [
      `resorts-temporary/slope_before/${resortId}.geojson`,
      {
        type: "FeatureCollection",
        features: [
          line(
            `${prefix}-course-a`,
            [
              [140, 43],
              [140.01, 43.01],
            ],
            { name: "Course A", avg: 10, piste: "○" },
          ),
          line(
            `${prefix}-course-b`,
            [
              [140.02, 43],
              [140.03, 43.01],
            ],
            { name: "Course B", avg: 20 },
          ),
          line(
            `${prefix}-course-c`,
            [
              [140.06, 43],
              [140.07, 43.01],
            ],
            { name: "Course C", piste: "○" },
          ),
        ],
      },
    ],
    [
      `resorts-temporary/slope_10m/${resortId}.geojson`,
      {
        type: "FeatureCollection",
        features: [
          line(
            `${prefix}-course-a`,
            [
              [140, 43],
              [140.01, 43.01],
            ],
            { name: "Course A", avg: 10 },
          ),
          line(
            `${prefix}-course-b`,
            [
              [140.02, 43],
              [140.03, 43.01],
            ],
            { name: "Course B", avg: 20 },
          ),
          line(
            `${prefix}-course-c`,
            [
              [140.06, 43],
              [140.07, 43.01],
            ],
            { name: "Course C" },
          ),
        ],
      },
    ],
    [
      `resorts-temporary/lift_before/${resortId}.geojson`,
      {
        type: "FeatureCollection",
        features: [
          line(
            `${prefix}-lift-a`,
            [
              [140, 43],
              [140.01, 43.01],
            ],
            { name: "Lift A", type: "リフト", hood: "×" },
          ),
        ],
      },
    ],
    [
      `resorts-temporary/lift_20m/${resortId}.geojson`,
      {
        type: "FeatureCollection",
        features: [
          line(
            `${prefix}-lift-a`,
            [
              [140, 43],
              [140.01, 43.01],
            ],
            { name: "Lift A", type: "リフト" },
          ),
        ],
      },
    ],
  ] as const;
  const readDoc = async (key: string) =>
    db.dataDocument.findUniqueOrThrow({ where: { key } });
  const resultRequest = async (
    result: Awaited<ReturnType<typeof api.submitCorrection>>,
  ) => {
    assert.equal(result.ok, true, JSON.stringify(result));
    return db.editRequest.findUniqueOrThrow({
      where: { id: result.requestId },
    });
  };
  const approve = (
    id: string,
    version: number,
    index: number,
    session = actor(adminId),
  ) =>
    run(session, () => api.decideCorrectionItem(id, version, index, "approve"));
  try {
    await db.user.createMany({
      data: [
        { id: adminId, name: "Correction Admin", role: "admin" },
        { id: editorId, name: "Correction Editor", role: "editor" },
      ],
    });
    await db.skiResort.create({
      data: {
        id: resortId,
        nameJa: "Correction Test",
        nameEn: "Correction Test",
        prefecture: "北海道",
        town: "テスト",
        latitude: 43,
        longitude: 140,
        topElevation: 1000,
        baseElevation: 500,
        verticalDrop: 500,
        numberOfCourses: 2,
        longestCourse: 1000,
        beginnersCoursesPercent: 50,
        intermediateCoursesPercent: 50,
        advancedCoursesPercent: 0,
        courseImages: [],
        numberOfLifts: 1,
        ropeways: 0,
        gondolas: 0,
        quadLifts: 0,
        tripleLifts: 0,
        pairLifts: 1,
        singleLifts: 0,
        otherLifts: 0,
        website: "https://old.example.invalid",
      },
    });
    for (const [key, value] of documents) {
      const content = JSON.stringify(value);
      await db.dataDocument.create({
        data: {
          key,
          content,
          mediaType: "application/geo+json",
          hash: api.hashDataDocumentContent(content),
          version: 1,
        },
      });
    }

    const owner = anonymous(),
      opKey = randomUUID();
    const basic = await resultRequest(
      await submit(
        [
          {
            targetKind: "resort",
            field: "website",
            proposed: "https://new.example.invalid",
          },
        ],
        owner,
        opKey,
      ),
    );
    assert.equal(basic.submissionKey?.length, 64);
    assert.equal(
      (await db.skiResort.findUniqueOrThrow({ where: { id: resortId } }))
        .website,
      "https://old.example.invalid",
    );
    assert.equal(
      (
        await resultRequest(
          await submit(
            [
              {
                targetKind: "resort",
                field: "website",
                proposed: "https://new.example.invalid",
              },
            ],
            owner,
            opKey,
          ),
        )
      ).id,
      basic.id,
    );
    await assert.rejects(() =>
      approve(basic.id, basic.version, 0, actor(editorId)),
    );
    const beforePayload = basic.submittedPayload;
    assert.equal(
      (
        await run(actor(adminId), () =>
          api.adjustCorrectionItem(
            basic.id,
            basic.version,
            0,
            "https://adjusted.example.invalid",
          ),
        )
      ).ok,
      true,
    );
    const adjusted = await db.editRequest.findUniqueOrThrow({
      where: { id: basic.id },
    });
    assert.deepEqual(adjusted.submittedPayload, beforePayload);
    const approvedBasic = await approve(basic.id, adjusted.version, 0);
    assert.equal(approvedBasic.ok, true, JSON.stringify(approvedBasic));
    assert.equal(
      (await db.skiResort.findUniqueOrThrow({ where: { id: resortId } }))
        .website,
      "https://adjusted.example.invalid",
    );

    const stale = await resultRequest(
      await submit([
        {
          targetKind: "resort",
          field: "website",
          proposed: "https://stale.example.invalid",
        },
      ]),
    );
    await db.skiResort.update({
      where: { id: resortId },
      data: { website: "https://external.example.invalid" },
    });
    assert.equal((await approve(stale.id, stale.version, 0)).ok, false);
    assert.equal(
      (await db.editRequest.findUniqueOrThrow({ where: { id: stale.id } }))
        .status,
      "PENDING",
    );

    const coords = [
      [140, 43],
      [140.011, 43.009],
      [140.02, 43.015],
    ];
    const shapeItems: SubmitCorrectionInput["items"] = [
      {
        targetKind: "slope",
        targetId: `${prefix}-course-a`,
        field: "coordinates",
        proposed: coords,
      },
      {
        targetKind: "slope",
        targetId: `${prefix}-course-b`,
        field: "coordinates",
        action: "delete",
        proposed: [
          [140.02, 43],
          [140.03, 43.01],
        ],
      },
      {
        targetKind: "slope",
        targetId: `${prefix}-course-new`,
        targetName: "New Course",
        field: "coordinates",
        action: "add",
        proposed: [
          [140.04, 43],
          [140.05, 43.01],
        ],
      },
    ];
    const shapeRequest = await resultRequest(await submit(shapeItems));
    assert.equal(
      (await readDoc(documents[0][0])).content.includes("140.011"),
      false,
    );
    let version = shapeRequest.version;
    for (let index = 0; index < shapeItems.length; index++) {
      const approved = await approve(shapeRequest.id, version, index);
      assert.equal(approved.ok, true, JSON.stringify(approved));
      version = approved.version;
    }
    const savedMap = JSON.parse(
      (await readDoc(documents[0][0])).content,
    ) as TestFeatureCollection;
    assert.deepEqual(
      savedMap.features[0].geometry.coordinates,
      coords,
      "geometry approval must preserve the submitted coordinates exactly (no snapping)",
    );
    assert.ok(
      savedMap.features.some(
        feature => feature.properties.entityId === `${prefix}-course-new`,
      ),
    );
    assert.ok(
      !savedMap.features.some(
        feature => feature.properties.entityId === `${prefix}-course-b`,
      ),
    );

    const derivedBefore = (await readDoc(documents[1][0])).hash;
    const segment = await resultRequest(
      await submit([
        {
          targetKind: "slope",
          targetId: `${prefix}-course-a`,
          field: "pisteSegments",
          proposed: [{ from: 0.25, to: 0.75, value: "△" }],
        },
      ]),
    );
    assert.equal((await approve(segment.id, segment.version, 0)).ok, true);
    const afterSegment = JSON.parse(
      (await readDoc(documents[0][0])).content,
    ) as TestFeatureCollection;
    assert.deepEqual(afterSegment.features[0].geometry.coordinates, coords);
    assert.equal(
      (await readDoc(documents[1][0])).hash,
      derivedBefore,
      "attribute segment edits must not rewrite derived geometry",
    );

    const bulk = await resultRequest(
      await submit([
        {
          targetKind: "slope",
          targetId: `${prefix}-course-a`,
          field: "piste",
          proposed: "×",
        },
        {
          targetKind: "slope",
          targetId: `${prefix}-course-c`,
          field: "piste",
          proposed: "○",
        },
      ]),
    );
    const bulkResult = await approve(bulk.id, bulk.version, 0);
    assert.equal(bulkResult.ok, true);
    assert.equal((await approve(bulk.id, bulkResult.version, 1)).ok, true);
    const bulkItems = (
      (await db.editRequest.findUniqueOrThrow({ where: { id: bulk.id } }))
        .candidatePayload as unknown as CandidateCorrectionPayload
    ).items;
    assert.equal(bulkItems[1].decision, "APPROVED_NOOP");
    const finalMap = JSON.parse(
      (await readDoc(documents[0][0])).content,
    ) as TestFeatureCollection;
    const courseA = finalMap.features.find(
      feature => feature.properties.entityId === `${prefix}-course-a`,
    );
    const courseC = finalMap.features.find(
      feature => feature.properties.entityId === `${prefix}-course-c`,
    );
    assert.ok(courseA);
    assert.ok(courseC);
    assert.equal(courseA.properties.piste, "×");
    assert.equal(courseC.properties.piste, "○");

    const imageBytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "blue" },
    })
      .jpeg()
      .toBuffer();
    const upload = new FormData();
    upload.append(
      "photos",
      new File([new Uint8Array(imageBytes)], "correction.jpg", {
        type: "image/jpeg",
      }),
    );
    const photoRequest = await resultRequest(
      await submit(
        [
          {
            targetKind: "other",
            field: "other-report",
            proposed: "地図の表示について",
          },
        ],
        anonymous(),
        randomUUID(),
        upload,
      ),
    );
    const photo = await db.contributionPhoto.findFirstOrThrow({
      where: { requestId: photoRequest.id },
    });
    assert.equal(photo.mimeType, "image/webp");
    assert.equal(
      (
        await run(anonymous(), () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId: photo.id }),
          }),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await run(actor(adminId), () =>
          api.photoGET(new Request("http://localhost"), {
            params: Promise.resolve({ photoId: photo.id }),
          }),
        )
      ).status,
      200,
    );

    const rejected = await resultRequest(
      await submit([
        {
          targetKind: "resort",
          field: "descriptionShort",
          proposed: "rejected proposal",
        },
      ]),
    );
    assert.equal(
      (
        await run(actor(adminId), () =>
          api.decideCorrectionItem(rejected.id, rejected.version, 0, "reject"),
        )
      ).ok,
      true,
    );
    assert.equal(
      (await db.skiResort.findUniqueOrThrow({ where: { id: resortId } }))
        .descriptionShort,
      null,
    );

    const race = await resultRequest(
      await submit([
        { targetKind: "resort", field: "descriptionShort", proposed: "race A" },
        { targetKind: "resort", field: "descriptionLong", proposed: "race B" },
      ]),
    );
    const raceResults = await Promise.all([
      approve(race.id, race.version, 0),
      approve(race.id, race.version, 1),
    ]);
    assert.equal(raceResults.filter(value => value.ok).length, 1);

    // A resort without any mapped lifts can add its first line. Approval
    // creates both source and derived documents without guessing connections.
    await db.dataDocument.deleteMany({
      where: { key: { in: [documents[2][0], documents[3][0]] } },
    });
    const firstLiftCoordinates = [
      [140.1, 43.1],
      [140.101, 43.102],
    ];
    const firstLift = await resultRequest(
      await submit([
        {
          targetKind: "lift",
          targetId: `${prefix}-first-lift`,
          targetName: "First Lift",
          field: "coordinates",
          action: "add",
          proposed: firstLiftCoordinates,
        },
      ]),
    );
    assert.equal(
      await db.dataDocument.count({ where: { key: documents[2][0] } }),
      0,
    );
    const firstLiftApproval = await approve(firstLift.id, firstLift.version, 0);
    assert.equal(firstLiftApproval.ok, true, JSON.stringify(firstLiftApproval));
    const firstLiftMap = JSON.parse(
      (await readDoc(documents[2][0])).content,
    ) as TestFeatureCollection;
    assert.deepEqual(
      firstLiftMap.features[0].geometry.coordinates,
      firstLiftCoordinates,
    );
    assert.equal(firstLiftMap.features[0].properties.name, "First Lift");
    assert.ok(
      (await readDoc(documents[3][0])).content.includes(`${prefix}-first-lift`),
    );
  } finally {
    await db.editRequestJob.deleteMany({ where: { request: { resortId } } });
    await db.contributionPhoto.deleteMany({ where: { request: { resortId } } });
    await db.editRequestEvent.deleteMany({ where: { request: { resortId } } });
    await db.editRequest.deleteMany({ where: { resortId } });
    await db.dataDocument.deleteMany({
      where: { key: { contains: resortId } },
    });
    await db.skiResort.deleteMany({ where: { id: resortId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, editorId] } } });
    await api.disconnectPrisma();
  }
});
