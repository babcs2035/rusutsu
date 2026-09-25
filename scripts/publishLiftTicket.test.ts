import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("CLI previews without writes, rejects changed inputs, applies with the previewed hash and pulls", () => {
  const repo = process.cwd();
  const root = mkdtempSync(path.join(os.tmpdir(), "lift-ticket-publish-cli-"));
  try {
    // Preview runs the skill's own validators, resolved from the cwd.
    symlinkSync(path.join(repo, ".shared"), path.join(root, ".shared"));
    const file = path.join(
      root,
      "src/private/data/lift-ticket/test-resort/2025-2026.json",
    );
    mkdirSync(path.dirname(file), { recursive: true });
    const valid = JSON.parse(
      readFileSync(
        path.join(repo, "src/private/data/lift-ticket/naeba/2025-2026.json"),
        "utf8",
      ),
    );
    valid.resort.id = "test-resort";
    const content = `${JSON.stringify(valid, null, 2)}\n`;
    writeFileSync(file, content);
    const remote = { ...valid, schema_version: "old" };
    const remoteContent = `${JSON.stringify(remote, null, 2)}\n`;
    const remoteData = JSON.stringify(remote);
    const mock = path.join(root, "mock-fetch.mjs");
    writeFileSync(
      mock,
      `import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, init) => {
  if (init.headers.Authorization !== 'Bearer cli-test-admin-key') throw Error('wrong key');
  if (init.method === 'PUT') {
    writeFileSync('submitted.json', init.body);
    return Response.json({ season: null });
  }
  const params = new URL(url).searchParams;
  if (params.get('resortId') !== 'test-resort' || params.get('seasonId') !== '2025-2026') throw Error('wrong query');
  return Response.json({ season: {
    resortId: 'test-resort', seasonId: '2025-2026', status: 'needs_review',
    version: 3, updatedAt: '2026-09-25T00:00:00.000Z', data: ${remoteData},
  } });
};`,
    );
    const run = (mode?: string, baseUrl = "https://example.test/rusutsu") =>
      spawnSync(
        process.execPath,
        [
          "--import",
          path.join(repo, "node_modules/tsx/dist/loader.mjs"),
          "--import",
          mock,
          path.join(repo, "scripts/publishLiftTicket.ts"),
          "--resort",
          "test-resort",
          "--season",
          "2025-2026",
          ...(mode ? [mode] : []),
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            TSX_TSCONFIG_PATH: path.join(repo, "tsconfig.json"),
            DATA_API_BASE_URL: baseUrl,
            INTERNAL_DATA_API_ADMIN_TOKEN: "cli-test-admin-key",
          },
        },
      );

    const preview = run();
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /version 3/);
    assert.match(preview.stdout, /-\s+"schema_version": "old"/);
    assert.equal(existsSync(path.join(root, "submitted.json")), false);
    assert.notEqual(run("--apply", "https://other.test/rusutsu").status, 0);
    writeFileSync(file, content.replace("\n}", ',\n  "extra": 1\n}'));
    assert.notEqual(run("--apply").status, 0);
    assert.equal(existsSync(path.join(root, "submitted.json")), false);
    writeFileSync(file, content);

    const applied = run("--apply");
    assert.equal(applied.status, 0, applied.stderr);
    const sent = JSON.parse(
      readFileSync(path.join(root, "submitted.json"), "utf8"),
    );
    assert.deepEqual(sent, {
      resortId: "test-resort",
      seasonId: "2025-2026",
      data: valid,
      expectedVersion: 3,
    });

    const pulled = run("--pull");
    assert.equal(pulled.status, 0, pulled.stderr);
    assert.equal(readFileSync(file, "utf8"), remoteContent);

    writeFileSync(file, JSON.stringify({ ...valid, offers: "broken" }));
    const invalid = run();
    assert.notEqual(invalid.status, 0);
    assert.equal(
      existsSync(
        path.join(
          root,
          "src/private/data/resorts-temporary/tmp/lift-ticket-publish/test-resort-2025-2026.plan.json",
        ),
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
