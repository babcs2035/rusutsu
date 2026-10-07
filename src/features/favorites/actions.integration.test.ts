import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const testDatabase = process.env.FAVORITES_TEST_DATABASE_URL;
test("favorites and recommendation projection use real PostgreSQL with isolated identities", {
  skip: !testDatabase,
}, async () => {
  const url = new URL(testDatabase ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.match(url.pathname, /^\/rusutsu_favorites_test_\d+$/u);
  process.env.DATABASE_URL = testDatabase;
  process.env.DATA_API_BASE_URL = "";
  const root = path.join(
    process.cwd(),
    "src/private/data/resorts-temporary/tmp/favorites",
  );
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, "integration.mjs");
  await build({
    stdin: {
      contents: `
      export { runtime } from 'favorite-test-runtime';
      export { prisma, disconnectPrisma } from '@/lib/prisma';
      export * from '@/features/favorites/actions';
      export * from '@/server/course-recommendations/projection';
      export * from '@/server/course-recommendations/repository';
      export * from '@/features/course-recommendations/actions';
      export { POST as recommendationIndexRoute } from '@/app/api/course-recommendations/route';
      export { writeDataDocumentsInTransaction } from '@/server/data-documents/repository';
      export { authConfig } from '@/lib/auth.config';
    `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: file,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "request-runtime",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|favorite-test-runtime|next\/headers|@\/auth)$/,
            },
            args => ({ path: args.path, namespace: "test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({
            loader: "js",
            contents:
              args.path === "server-only"
                ? "export {}"
                : args.path === "favorite-test-runtime"
                  ? `import { AsyncLocalStorage } from 'node:async_hooks'; export const runtime = new AsyncLocalStorage();`
                  : args.path === "@/auth"
                    ? `import { runtime } from 'favorite-test-runtime'; export async function auth() {return runtime.getStore().session;} export async function signIn(provider, options) { runtime.getStore().login = {provider, options}; } export async function signOut() {runtime.getStore().session = null;}`
                    : `import { runtime } from 'favorite-test-runtime'; export async function cookies() { const store = runtime.getStore().cookies; return {get: key => store.has(key) ? {value: store.get(key)} : undefined, set: (key, value) => store.set(key, value), delete: key => store.delete(key)};}`,
          }));
        },
      },
    ],
  });
  const api = await import(pathToFileURL(file).href);
  const db = api.prisma;
  const account = (id: string | null, nonce?: string) => ({
    session: id ? { user: { id }, favoriteLoginNonce: nonce } : null,
    cookies: new Map<string, string>(),
    login: null as null | { provider: string; options: { redirectTo: string } },
  });
  const a = account("user-a"),
    b = account("user-b"),
    guest = account(null);
  const run = <T>(actor: ReturnType<typeof account>, action: () => T): T =>
    api.runtime.run(actor, action);
  const data = {
    nameJa: "検証用",
    nameEn: "Test",
    prefecture: "北海道",
    town: "検証",
    latitude: 43,
    longitude: 140,
    topElevation: 1000,
    baseElevation: 500,
    verticalDrop: 500,
    numberOfCourses: 1,
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
  };
  try {
    await db.user.createMany({ data: [{ id: "user-a" }, { id: "user-b" }] });
    await db.skiResort.createMany({
      data: [
        "source",
        "candidate",
        "third",
        "linked-parent",
        "linked-child",
      ].map(id => ({ id, ...data })),
    });
    await db.skiResort.update({
      where: { id: "linked-parent" },
      data: { linkKind: "LINKED", sourceResortIds: ["source", "linked-child"] },
    });
    await db.skiResort.update({
      where: { id: "linked-child" },
      data: { mergedIntoId: "linked-parent" },
    });
    await run(a, () => api.updateFavorite("source", true, "user-a"));
    const merged = await run(a, () =>
      api.syncFavorites(["candidate", "candidate", "missing"], "user-a"),
    );
    assert.deepEqual(merged.ids, ["candidate", "source"]);
    await run(a, () => api.syncFavorites(["candidate"], "user-a"));
    assert.equal(await db.favorite.count({ where: { userId: "user-a" } }), 2);
    assert.deepEqual(
      (await run(b, () => api.syncFavorites([], "user-b"))).ids,
      [],
    );
    await assert.rejects(
      run(b, () => api.updateFavorite("source", false, "user-a")),
    );
    await assert.rejects(
      run(guest, () => api.updateFavorite("source", true, "user-a")),
    );
    await run(a, () => api.updateFavorite("source", false, "user-a"));
    assert.deepEqual(
      (await run(a, () => api.syncFavorites([], "user-a"))).ids,
      ["candidate"],
    );
    await run(guest, () =>
      api.startPublicLogin("/rusutsu/?resort=source", "third"),
    );
    assert.equal(guest.login?.provider, "google");
    assert.match(
      guest.login?.options.redirectTo ?? "",
      /resort=source.*favoriteLogin=/u,
    );
    const intent = guest.cookies.get("rusutsu-favorite-intent") as string;
    a.cookies.set("rusutsu-favorite-intent", intent);
    // Returning with an old session / cancelled login never saves the pending item.
    assert.equal(
      (await run(a, () => api.syncFavorites([], "user-a"))).addedPending,
      false,
    );
    a.cookies.set("rusutsu-favorite-intent", intent);
    const token = await run(a, () =>
      api.authConfig.callbacks.jwt({
        token: {},
        user: {
          id: "user-a",
          email: "favorite-test@example.invalid",
          role: "viewer",
        },
      }),
    );
    assert.equal(token.role, "viewer");
    a.session = {
      user: { id: "user-a" },
      favoriteLoginNonce: token.favoriteLoginNonce,
    };
    assert.equal(
      (await run(a, () => api.syncFavorites([], "user-a"))).addedPending,
      true,
    );
    assert.equal(
      (await run(a, () => api.syncFavorites([], "user-a"))).addedPending,
      false,
    );
    await assert.rejects(
      run(guest, () =>
        api.startPublicLogin("https://outside.invalid/", "source"),
      ),
    );
    await assert.rejects(
      run(guest, () => api.startPublicLogin("/rusutsu/admin", "source")),
    );
    guest.cookies.set("rusutsu-login-history", "1");
    assert.equal(await run(guest, () => api.readLoginHistory()), true);
    await run(guest, () => api.publicLogout());
    assert.equal(await run(guest, () => api.readLoginHistory()), false);
    assert.equal(api.authConfig.session.maxAge, 30 * 24 * 60 * 60);
    assert.equal(
      api.authConfig.callbacks.redirect({
        url: "https://local.test/rusutsu/?resort=source",
        baseUrl: "https://local.test",
      }),
      "https://local.test/rusutsu/?resort=source",
    );

    const content = (resort: string, route = 2) =>
      JSON.stringify({
        type: "FeatureCollection",
        features: [2, 10].map((number, index) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: Array.from({ length: 41 }, (_, i) => [
              140 + (resort === "source" ? 0 : 0.01),
              43 + i * 0.00009,
              1000 - i * 3,
            ]),
          },
          properties: {
            entityId: `${resort}-${number}`,
            name: "コースA",
            piste: "○",
            courseGrouping: {
              id: `${resort}-group`,
              name: "コースA",
              kind: "routes",
              order: index + 1,
              route: number === 2 ? route : number,
            },
          },
        })),
      });
    const { createHash } = await import("node:crypto");
    const write = async (
      resort: string,
      value: string,
      expectedHash: string | null,
    ) => {
      const hash = createHash("sha256").update(value).digest("hex");
      await db.$transaction(
        (tx: unknown) =>
          api.writeDataDocumentsInTransaction(tx, [
            {
              key: `resorts-temporary/slope_10m/${resort}.geojson`,
              content: value,
              mediaType: "application/geo+json",
              hash,
              expectedHash,
              fallbackHash: null,
            },
          ]),
        { timeout: 30000 },
      );
      return hash;
    };
    let sourceHash = await write("source", content("source"), null);
    await write("candidate", content("candidate"), null);
    assert.equal(await db.courseRecommendationFeature.count(), 2);
    const main = {
      kind: "course",
      id: "source-group",
      routeId: "source-group:route:2",
    };
    assert.equal(
      (await api.searchCourseRecommendationsDirect("source", main, ["third"]))
        .status,
      "candidates_unavailable",
    );
    assert.equal(
      (await api.searchCourseRecommendationsDirect("source", main, ["source"]))
        .status,
      "no_other_favorites",
    );
    const rec = await api.recommendCoursesDirect("source", main, [
      "candidate",
      "source",
      "linked-child",
    ]);
    assert.equal(rec.length, 1);
    assert.equal(rec[0].score, 100);
    assert.equal(rec[0].selected.routeId, "candidate-group:route:2");
    assert.equal(
      (
        await api.searchCourseRecommendationsDirect("source", main, [
          "candidate",
        ])
      ).status,
      "ready",
    );
    assert.deepEqual(
      await api.recommendCoursesDirect(
        "source",
        { ...main, routeId: "source-group:route:10" },
        ["candidate"],
      ),
      [],
    );
    // A canonical identity migration must remove old selection IDs and publish
    // current IDs in the same transaction, without changing the course shape.
    const migrated = JSON.parse(content("source"));
    for (const f of migrated.features)
      f.properties.courseGrouping.id = "current-source-group";
    sourceHash = await write("source", JSON.stringify(migrated), sourceHash);
    assert.equal(
      (
        await api.searchCourseRecommendationsDirect("source", main, [
          "candidate",
        ])
      ).status,
      "source_unavailable",
    );
    const currentMain = {
      ...main,
      id: "current-source-group",
      routeId: "current-source-group:route:2",
    };
    const current = await api.searchCourseRecommendationsDirect(
      "source",
      currentMain,
      ["candidate"],
    );
    assert.equal(current.status, "ready");
    assert.equal(current.recommendations[0].score, 100);
    assert.ok(current.recommendations[0].maxSlope > 0);
    assert.ok(current.recommendations[0].candidateSteepDistance > 0);
    const index = await api.getCourseRecommendationIndexDirect("source", [
      "candidate",
    ]);
    assert.equal(index.status, "ready");
    assert.deepEqual(index.courses[0].recommendations, current.recommendations);
    const requestIndex = (guestFavorites: string[]) =>
      api.recommendationIndexRoute(
        new Request("http://localhost/rusutsu/api/course-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resortId: "source", guestFavorites }),
        }),
      );
    const guestResponse = await run(guest, () => requestIndex(["candidate"]));
    assert.equal(guestResponse.status, 200);
    assert.deepEqual(await guestResponse.json(), index);
    assert.equal(
      guestResponse.headers.get("Cache-Control"),
      "private, no-store",
    );
    // Logged-in requests use DB favorites even if the supplied guest list differs.
    const accountResponse = await run(a, () => requestIndex(["third"]));
    assert.deepEqual(await accountResponse.json(), index);
    const otherAccountResponse = await run(b, () =>
      requestIndex(["candidate"]),
    );
    assert.equal((await otherAccountResponse.json()).status, "no_favorites");
    const invalidResponse = await run(guest, () =>
      api.recommendationIndexRoute(
        new Request("http://localhost/rusutsu/api/course-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resortId: "source", guestFavorites: [42] }),
        }),
      ),
    );
    assert.equal(invalidResponse.status, 400);
    const opposite = JSON.parse(content("candidate"));
    for (const f of opposite.features) f.properties.piste = "×";
    const candidateDocument = await db.dataDocument.findUniqueOrThrow({
      where: { key: "resorts-temporary/slope_10m/candidate.geojson" },
    });
    await write("candidate", JSON.stringify(opposite), candidateDocument.hash);
    const reference = await api.searchCourseRecommendationsDirect(
      "source",
      currentMain,
      ["candidate"],
    );
    assert.equal(reference.recommendations.length, 1);
    assert.equal(reference.recommendations[0].groomingDifferent, true);
    // Rows from an older calculation are never compared with current ones.
    await db.courseRecommendationFeature.updateMany({
      where: { resortId: "source" },
      data: { calculationVersion: 2 },
    });
    assert.equal(
      (
        await api.searchCourseRecommendationsDirect("source", currentMain, [
          "candidate",
        ])
      ).status,
      "source_unavailable",
    );
    sourceHash = await write("source", JSON.stringify(migrated), sourceHash);
    const savedFetch = globalThis.fetch;
    const savedApiUrl = process.env.DATA_API_BASE_URL;
    const savedToken = process.env.INTERNAL_DATA_API_ADMIN_TOKEN;
    try {
      process.env.DATA_API_BASE_URL = "https://canonical.test/rusutsu";
      process.env.INTERNAL_DATA_API_ADMIN_TOKEN = "isolated-test-token";
      globalThis.fetch = async () =>
        Response.json({ recommendations: current.recommendations });
      assert.equal(
        (
          await run(guest, () =>
            api.getCourseRecommendations("source", currentMain, ["candidate"]),
          )
        ).status,
        "api_outdated",
      );
      globalThis.fetch = async () =>
        Response.json({
          status: "ready",
          calculationVersion: 3,
          recommendations: current.recommendations,
        });
      const remote = await run(guest, () =>
        api.getCourseRecommendations("source", currentMain, ["candidate"]),
      );
      assert.equal(remote.status, "ready");
      assert.equal(
        remote.recommendations[0].maxSlope,
        current.recommendations[0].maxSlope,
      );
      globalThis.fetch = async () =>
        Response.json({ error: "old-contract" }, { status: 400 });
      assert.equal(
        (
          await run(guest, () =>
            api.getCourseRecommendationIndex("source", ["candidate"]),
          )
        ).status,
        "api_outdated",
      );
      globalThis.fetch = async () =>
        Response.json({
          status: "ready",
          calculationVersion: 3,
          courses: index.courses,
        });
      const remoteIndex = await run(guest, () =>
        api.getCourseRecommendationIndex("source", ["candidate"]),
      );
      assert.deepEqual(
        remoteIndex.courses[0].recommendations,
        current.recommendations,
      );
    } finally {
      globalThis.fetch = savedFetch;
      if (savedApiUrl === undefined) delete process.env.DATA_API_BASE_URL;
      else process.env.DATA_API_BASE_URL = savedApiUrl;
      if (savedToken === undefined)
        delete process.env.INTERNAL_DATA_API_ADMIN_TOKEN;
      else process.env.INTERNAL_DATA_API_ADMIN_TOKEN = savedToken;
    }

    sourceHash = await write(
      "source",
      JSON.stringify({ type: "FeatureCollection", features: [] }),
      sourceHash,
    );
    assert.equal(
      await db.courseRecommendationFeature.count({
        where: { resortId: "source" },
      }),
      0,
    );
    assert.deepEqual(
      await api.recommendCoursesDirect("source", main, ["candidate"]),
      [],
    );
    assert.equal(
      (
        await api.searchCourseRecommendationsDirect("source", currentMain, [
          "candidate",
        ])
      ).status,
      "source_unavailable",
    );
  } finally {
    await api.disconnectPrisma();
  }
});
