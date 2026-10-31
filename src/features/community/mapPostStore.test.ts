import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

type FetchHandler = (url: URL) => Promise<unknown>;
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-31T03:00:00Z") });
after(() => mock.timers.reset());

const testFile = fileURLToPath(import.meta.url);
const featureDir = path.dirname(testFile);
const taskTemp = path.resolve(
  featureDir,
  "../../private/data/resorts-temporary/tmp/community-map-tests",
);
const bundlePath = path.join(taskTemp, "mapPostStore.bundle.cjs");
const require = createRequire(import.meta.url);
const effects: Array<() => void> = [];
Object.assign(globalThis, { __communityMapEffects: effects });
let mapStore: typeof import("./mapPostStore");
let invokeLayer: typeof mapStore.useCommunityMapLayer;
type MapLayer = ReturnType<typeof mapStore.useCommunityMapLayer>;
const setup = (async () => {
  await mkdir(taskTemp, { recursive: true });
  await build({
    entryPoints: [path.join(featureDir, "mapPostStore.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "react-hook-stub",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^react$/ }, () => ({
            path: "react",
            namespace: "react-stub",
          }));
          pluginBuild.onResolve({ filter: /^\.\/contract$/ }, () => ({
            path: "contract",
            namespace: "contract-stub",
          }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "react-stub" }, () => ({
            contents: `
                module.exports = {
                  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
                  useEffect(callback) { globalThis.__communityMapEffects.push(callback); },
                };
              `,
            loader: "js",
          }));
          pluginBuild.onLoad(
            { filter: /.*/, namespace: "contract-stub" },
            () => ({
              contents: `
                exports.ENTRY_KINDS = {
                  COURSE: "コース",
                  MOGUL: "コブ",
                  ITEM: "パーク",
                  LIFT: "リフト",
                };
              `,
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  mapStore = require(bundlePath) as typeof import("./mapPostStore");
  invokeLayer = mapStore.useCommunityMapLayer;
})();

function installFetch(handler: FetchHandler) {
  const calls: URL[] = [];
  globalThis.fetch = (async input => {
    const url = new URL(String(input), "http://localhost");
    calls.push(url);
    const value = await handler(url);
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

async function settle() {
  for (let index = 0; index < 4; index++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

function render(id: string, active: boolean): MapLayer {
  const layer = invokeLayer(id, active);
  const pending = effects.splice(0);
  for (const effect of pending) effect();
  return layer;
}

function renderTwoConsumers(id: string, active: boolean) {
  const first = invokeLayer(id, active);
  const second = invokeLayer(id, active);
  const pending = effects.splice(0);
  for (const effect of pending) effect();
  return [first, second] as const;
}

function summary(latestObservedOn: string | null, total = 1) {
  return { ok: true, data: { total, latestObservedOn } };
}

function mapEntry(id: string) {
  return {
    id,
    postId: `post-${id}`,
    kind: "MOGUL",
    observedOn: "2026-10-30",
    latitude: 43,
    longitude: 142,
    courseId: null,
    liftId: null,
    targetName: "コースA",
    photo: null,
    photoCount: 0,
  };
}

test("unknown, empty, and failed summaries cannot enable; positive summary can", async () => {
  await setup;
  const scenarios = [
    { id: "unknown", response: summary("2026-10-30"), expectedAvailable: true },
    { id: "zero", response: summary(null, 0), expectedAvailable: false },
    {
      id: "error",
      response: { ok: false, error: "failed" },
      expectedAvailable: false,
    },
  ];
  for (const scenario of scenarios) {
    installFetch(async () => scenario.response);
    const first = render(`map-post-${scenario.id}`, true);
    assert.equal(first.available, false);
    assert.equal(first.enabled, false);
    first.setEnabled(true);
    assert.equal(render(`map-post-${scenario.id}`, false).enabled, false);
    await settle();
    const loaded = render(`map-post-${scenario.id}`, false);
    assert.equal(
      loaded.available,
      scenario.expectedAvailable,
      JSON.stringify({
        scenario: scenario.id,
        summary: loaded.summary,
        error: loaded.summaryError,
      }),
    );
    loaded.setEnabled(true);
    const toggled = render(`map-post-${scenario.id}`, false);
    assert.equal(toggled.enabled, scenario.expectedAvailable);
    if (scenario.id === "error") assert.ok(toggled.summaryError);
  }
});

test("older summaries choose season or all and manual period survives off/on", async () => {
  await setup;
  const chosen: Array<[string, string, string]> = [
    ["season", "2026-10-24", "season"],
    ["all", "2026-09-30", "all"],
  ];
  for (const [id, latestObservedOn, expectedPeriod] of chosen) {
    installFetch(async () => summary(latestObservedOn));
    render(`map-post-period-${id}`, true);
    await settle();
    assert.equal(render(`map-post-period-${id}`, false).period, expectedPeriod);
  }

  installFetch(async url => {
    if (url.searchParams.has("summary")) return summary("2026-10-30");
    return { ok: true, data: { entries: [], nextCursor: null } };
  });
  const id = "map-post-manual-period";
  render(id, true);
  await settle();
  render(id, false).setEnabled(true);
  render(id, false).setPeriod("all");
  render(id, false).setEnabled(false);
  assert.equal(render(id, false).period, "all");
  assert.equal(render(id, false).enabled, false);
  render(id, true).setEnabled(true);
  const active = render(id, true);
  assert.equal(active.period, "all");
  await settle();
});

test("publishes page one before a delayed next page and deduplicates consumers", async () => {
  await setup;
  let finishSecondPage!: (value: unknown) => void;
  const secondPage = new Promise<unknown>(resolve => {
    finishSecondPage = resolve;
  });
  const id = "map-post-pagination";
  const calls = installFetch(async url => {
    if (url.searchParams.has("summary")) return summary("2026-10-30");
    if (url.searchParams.get("cursor") === "next") return secondPage;
    return {
      ok: true,
      data: { entries: [mapEntry("page-1")], nextCursor: "next" },
    };
  });
  render(id, true);
  await settle();
  render(id, false).setEnabled(true);
  renderTwoConsumers(id, true);
  await settle();

  const duringPagination = render(id, false);
  assert.deepEqual(
    duringPagination.entries.map(entry => entry.id),
    ["page-1"],
  );
  assert.equal(duringPagination.loading, true);
  const entryRequests = calls.filter(url => !url.searchParams.has("summary"));
  assert.equal(entryRequests.length, 2);
  assert.equal(
    entryRequests.filter(url => !url.searchParams.has("cursor")).length,
    1,
  );

  finishSecondPage({
    ok: true,
    data: { entries: [mapEntry("page-2")], nextCursor: null },
  });
  await settle();
  const complete = render(id, false);
  assert.deepEqual(
    complete.entries.map(entry => entry.id),
    ["page-1", "page-2"],
  );
  assert.equal(complete.loading, false);
});

test("retry reloads a page after a request failure", async () => {
  await setup;
  const id = "map-post-retry";
  let pageAttempts = 0;
  const calls = installFetch(async url => {
    if (url.searchParams.has("summary")) return summary("2026-10-30");
    pageAttempts++;
    if (pageAttempts === 1) return { ok: false, error: "failed" };
    return {
      ok: true,
      data: { entries: [mapEntry("retried")], nextCursor: null },
    };
  });
  render(id, true);
  await settle();
  render(id, false).setEnabled(true);
  render(id, true);
  await settle();
  const failed = render(id, false);
  assert.ok(failed.error);
  assert.equal(pageAttempts, 1);
  failed.retry();
  await settle();
  const retried = render(id, false);
  assert.equal(retried.error, null);
  assert.deepEqual(
    retried.entries.map(entry => entry.id),
    ["retried"],
  );
  assert.equal(calls.filter(url => !url.searchParams.has("summary")).length, 2);
});
