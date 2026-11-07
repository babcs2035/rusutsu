import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const testRoot = path.resolve(
  "src/private/data/resorts-temporary/tmp/internal-api-retry",
);
const bundlePath = path.join(testRoot, "internal-data-api-client.mjs");

test("internal data API retries transient safe-method failures only", async t => {
  await fs.mkdir(testRoot, { recursive: true });
  await build({
    stdin: {
      contents: `export { fetchInternalDataApi, InternalDataApiError } from './src/lib/internalDataApiClient';`,
      resolveDir: process.cwd(),
      sourcefile: "internal-data-api-client-test.ts",
      loader: "ts",
    },
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "server-only-test-stub",
        setup(builder) {
          builder.onResolve({ filter: /^server-only$/ }, () => ({
            path: "server-only",
            namespace: "stub",
          }));
          builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: "export {};",
            loader: "js",
          }));
        },
      },
    ],
  });
  const { fetchInternalDataApi, InternalDataApiError } = (await import(
    pathToFileURL(bundlePath).href
  )) as typeof import("./internalDataApiClient");
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.DATA_API_BASE_URL;
  const originalToken = process.env.INTERNAL_DATA_API_ADMIN_TOKEN;
  process.env.DATA_API_BASE_URL = "https://data.example.test";
  process.env.INTERNAL_DATA_API_ADMIN_TOKEN = "test-token";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.DATA_API_BASE_URL;
    else process.env.DATA_API_BASE_URL = originalBase;
    if (originalToken === undefined)
      delete process.env.INTERNAL_DATA_API_ADMIN_TOKEN;
    else process.env.INTERNAL_DATA_API_ADMIN_TOKEN = originalToken;
  });

  await t.test("502 then 200 retries once", async () => {
    let calls = 0;
    globalThis.fetch = async () =>
      ++calls === 1
        ? new Response(null, { status: 502 })
        : Response.json({ ok: true });
    const response = await fetchInternalDataApi("/api/internal/v1/test");
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  await t.test(
    "persistent 502 stops after three attempts with original error",
    async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response(null, { status: 502 });
      };
      await assert.rejects(
        fetchInternalDataApi("/api/internal/v1/test"),
        (error: unknown) =>
          error instanceof InternalDataApiError &&
          error.status === 502 &&
          error.message === "正本データAPIがHTTP 502を返しました。",
      );
      assert.equal(calls, 3);
    },
  );

  await t.test("POST and 401 are not retried", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 401 });
    };
    await assert.rejects(
      fetchInternalDataApi("/api/internal/v1/test", { method: "POST" }),
    );
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(fetchInternalDataApi("/api/internal/v1/test"));
    assert.equal(calls, 1);
  });

  await t.test(
    "accepted transient status is returned without retry",
    async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response(null, { status: 503 });
      };
      const response = await fetchInternalDataApi(
        "/api/internal/v1/test",
        {},
        { acceptedErrorStatuses: [503] },
      );
      assert.equal(response.status, 503);
      assert.equal(calls, 1);
    },
  );

  await t.test("external abort interrupts retry wait", async () => {
    const controller = new AbortController();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      controller.abort();
      return new Response(null, { status: 502 });
    };
    await assert.rejects(
      fetchInternalDataApi("/api/internal/v1/test", {
        signal: controller.signal,
      }),
      (error: unknown) =>
        error instanceof InternalDataApiError &&
        error.message === "正本データAPIへの接続がタイムアウトしました。",
    );
    assert.equal(calls, 1);
  });
});
