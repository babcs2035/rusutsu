import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const runtimeModule = "favorite-cookie-runtime";
const apiPromise = (async () => {
  const directory = path.join(
    process.cwd(),
    "src/private/data/resorts-temporary/tmp/favorites-cookie-check",
  );
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, "actions.mjs");
  await build({
    stdin: {
      contents: `export { runtime } from '${runtimeModule}';
        export * from '@/features/favorites/actions';`,
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
        name: "cookie-request-runtime",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(favorite-cookie-runtime|next\/headers|@\/auth|@\/lib\/prisma)$/,
            },
            args => ({ path: args.path, namespace: "test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({
            loader: "js",
            contents:
              args.path === runtimeModule
                ? `import { AsyncLocalStorage } from 'node:async_hooks';
                  export const runtime = new AsyncLocalStorage();`
                : args.path === "@/auth"
                  ? `import { runtime } from '${runtimeModule}';
                    export async function auth() { return runtime.getStore().session; }
                    export async function signIn() {}
                    export async function signOut() {}`
                  : args.path === "@/lib/prisma"
                    ? `export const prisma = { $transaction: fn => fn({
                      skiResort: { findMany: async () => [] },
                      favorite: { createMany: async () => {}, findMany: async () => [] }
                    }) };`
                    : `import { runtime } from '${runtimeModule}';
                      export async function cookies() {
                        const actor = runtime.getStore();
                        return {
                          get: key => actor.values.has(key) ? { value: actor.values.get(key) } : undefined,
                          set: (key, value, options) => {
                            actor.writes.push(key);
                            if (options?.maxAge === 0) actor.values.delete(key);
                            else actor.values.set(key, value);
                          }
                        };
                      }`,
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(file).href);
})();

const historyKey = "rusutsu-login-history";
const intentKey = "rusutsu-favorite-intent";
const actor = (userId: string | null) => ({
  session: userId ? { user: { id: userId } } : null,
  values: new Map<string, string>(),
  writes: [] as string[],
});

test("guest history checks preserve the page without cookie writes", async () => {
  const api = await apiPromise;
  const guest = actor(null);
  guest.values.set(historyKey, "1");
  for (let attempt = 0; attempt < 2; attempt++)
    assert.equal(
      await api.runtime.run(guest, () => api.readLoginHistory()),
      true,
    );
  assert.deepEqual(guest.writes, []);
});

test("cancelled login intent is cleared once, then checks are read only", async () => {
  const api = await apiPromise;
  const guest = actor(null);
  guest.values.set(intentKey, "cancelled-login");
  for (let attempt = 0; attempt < 2; attempt++)
    assert.equal(
      await api.runtime.run(guest, () => api.readLoginHistory()),
      false,
    );
  assert.deepEqual(guest.writes, [intentKey]);
  assert.equal(guest.values.has(intentKey), false);
});

test("authenticated history is recorded once without rewriting on return", async () => {
  const api = await apiPromise;
  const account = actor("user-a");
  for (let attempt = 0; attempt < 2; attempt++)
    assert.equal(
      await api.runtime.run(account, () => api.readLoginHistory()),
      false,
    );
  assert.deepEqual(account.writes, [historyKey]);
  assert.equal(account.values.get(historyKey), "1");
});

test("favorite sync writes login cookies once and preserves subsequent views", async () => {
  const api = await apiPromise;
  const account = actor("user-a");
  account.values.set(intentKey, "cancelled-login");
  await api.runtime.run(account, () => api.syncFavorites([], "user-a"));
  assert.deepEqual(account.writes, [intentKey, historyKey]);
  account.writes.length = 0;
  await api.runtime.run(account, () => api.syncFavorites([], "user-a"));
  assert.deepEqual(account.writes, []);
});
