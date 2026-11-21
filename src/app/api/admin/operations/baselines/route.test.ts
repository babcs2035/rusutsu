import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { testArtifactPath } from "../../../../../../scripts/testArtifacts";

const testRoot = testArtifactPath("operation-baseline-route-tests");
const originalToken = process.env.API_BEARER_TOKEN;

test("operation baseline GET is token-protected and returns the narrow baseline", async t => {
  await fs.mkdir(testRoot, { recursive: true });
  const bundlePath = path.join(testRoot, "route.mjs");
  await build({
    stdin: {
      contents: `
        export { GET } from '@/app/api/admin/operations/baselines/route';
        export { resetBaselineState, baselineState, setBaseline } from 'operation-baseline-route-state';
      `,
      resolveDir: process.cwd(),
      sourcefile: "operation-baseline-route-test.ts",
      loader: "ts",
    },
    outfile: bundlePath,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "operation-baseline-route-stubs",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|operation-baseline-route-state|@[/]server[/]course-lift[/]operationBaseline)$/,
            },
            args => ({
              path: args.path,
              namespace: "operation-baseline-route",
            }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "operation-baseline-route" },
            args => ({
              loader: "js",
              contents:
                args.path === "server-only"
                  ? "export {};"
                  : args.path === "operation-baseline-route-state"
                    ? `
                      export const baselineState = { calls: [], value: null };
                      export function resetBaselineState() {
                        baselineState.calls.length = 0;
                        baselineState.value = null;
                      }
                      export function setBaseline(value) { baselineState.value = value; }
                      export async function readOperationBaseline(resortId) {
                        baselineState.calls.push(resortId);
                        return baselineState.value;
                      }
                    `
                    : `
                      import { baselineState } from 'operation-baseline-route-state';
                      export async function readOperationBaseline(resortId) {
                        baselineState.calls.push(resortId);
                        return baselineState.value;
                      }
                    `,
            }),
          );
        },
      },
    ],
  });

  process.env.API_BEARER_TOKEN = "route-test-api-token";
  process.env.API_BEARER_TOKEN = "route-test-api-token";
  process.env.API_BEARER_TOKEN = "route-test-api-token";
  const api = await import(pathToFileURL(bundlePath).href);
  const restoreEnvironment = () => {
    if (originalToken === undefined) delete process.env.API_BEARER_TOKEN;
    else process.env.API_BEARER_TOKEN = originalToken;
  };
  t.after(restoreEnvironment);

  await t.test("requires the server token, with no cookie bypass", async () => {
    api.resetBaselineState();
    const noAuth = await api.GET(
      new Request("https://internal.example/api?resortId=sample", {
        headers: { Cookie: "authjs.session-token=some-session" },
      }),
    );
    assert.equal(noAuth.status, 401);
    assert.equal((await noAuth.json()).code, "UNAUTHORIZED");

    const adminScope = await api.GET(
      new Request("https://internal.example/api?resortId=sample", {
        headers: { Authorization: "Bearer incorrect-token" },
      }),
    );
    assert.equal(adminScope.status, 401);
    assert.equal((await adminScope.json()).code, "UNAUTHORIZED");
    assert.deepEqual(api.baselineState.calls, []);
  });

  await t.test(
    "rejects invalid IDs and ambiguous or extra query parameters",
    async () => {
      api.resetBaselineState();
      const invalidQueries = [
        "",
        "?resortId=",
        "?resortId=Uppercase",
        "?resortId=sample%2Fother",
        "?resortId=sample-",
        "?resortId=sample&resortId=other",
        "?resortId=sample&extra=1",
      ];
      for (const query of invalidQueries) {
        const response = await api.GET(
          new Request(
            `https://internal.example/api/admin/operations/baselines${query}`,
            { headers: { Authorization: "Bearer route-test-api-token" } },
          ),
        );
        assert.equal(response.status, 400, query || "missing resortId");
        assert.equal((await response.json()).code, "INVALID_QUERY");
      }
      assert.deepEqual(api.baselineState.calls, []);
    },
  );

  await t.test(
    "returns names-only baseline with listing modes and no-store headers",
    async () => {
      api.resetBaselineState();
      const baseline = {
        enabled: true,
        courses: {
          rows: [
            {
              id: "course-1",
              crawledNames: ["A course"],
              mappingAssigned: true,
            },
          ],
          listingMode: "operating-only",
        },
        lifts: {
          rows: [
            {
              id: "lift-1",
              crawledNames: ["A lift"],
              mappingAssigned: false,
            },
          ],
          listingMode: "complete",
        },
      };
      api.setBaseline(baseline);
      const response = await api.GET(
        new Request(
          "https://internal.example/api/admin/operations/baselines?resortId=sample-resort",
          { headers: { Authorization: "Bearer route-test-api-token" } },
        ),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "Authorization");
      assert.deepEqual(await response.json(), baseline);
      assert.deepEqual(api.baselineState.calls, ["sample-resort"]);
    },
  );

  await t.test(
    "preserves disabled API response without querying map data",
    async () => {
      api.resetBaselineState();
      api.setBaseline({ enabled: false });
      const response = await api.GET(
        new Request(
          "https://internal.example/api/admin/operations/baselines?resortId=sample-resort",
          { headers: { Authorization: "Bearer route-test-api-token" } },
        ),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { enabled: false });
      assert.deepEqual(api.baselineState.calls, ["sample-resort"]);
    },
  );
});
