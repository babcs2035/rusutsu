import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { finalize, prune, verifyGeneration } from "./local-backup.mjs";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "rusutsu-local-backup-"));
  return {
    root,
    async create(stamp: string, suffix: string) {
      const temporary = `.incomplete-${suffix}`;
      mkdirSync(path.join(root, temporary), { mode: 0o700 });
      writeFileSync(
        path.join(root, temporary, "database.dump"),
        "PGDMP-fixture",
      );
      writeFileSync(
        path.join(root, temporary, "archive.list"),
        "archive fixture",
      );
      const name = `rusutsu-db-${stamp}-${suffix}`;
      await finalize(root, temporary, name);
      return name;
    },
    clean() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("completed local backup records checksums and restricts file permissions", async () => {
  const f = fixture();
  try {
    const name = await f.create("20260905T000000Z", "aaaaaaaa");
    await verifyGeneration(f.root, name);
    for (const file of readdirSync(path.join(f.root, name)))
      assert.equal(statSync(path.join(f.root, name, file)).mode & 0o777, 0o600);
    const metadata = JSON.parse(
      readFileSync(path.join(f.root, name, "metadata.json"), "utf8"),
    );
    assert.equal(metadata.storage, "vps-local");
    writeFileSync(path.join(f.root, name, "database.dump"), "corrupted");
    await assert.rejects(verifyGeneration(f.root, name), /checksum/);
  } finally {
    f.clean();
  }
});

test("retention preserves minimum count, recent generations, corrupt files and unrelated paths", async () => {
  const f = fixture();
  try {
    const old = await f.create("20200101T000000Z", "aaaaaaaa");
    const newer = await f.create("20210101T000000Z", "bbbbbbbb");
    const corrupt = await f.create("20200102T000000Z", "cccccccc");
    writeFileSync(path.join(f.root, corrupt, "database.dump"), "corrupt");
    mkdirSync(path.join(f.root, "unrelated"));
    mkdirSync(path.join(f.root, ".incomplete-dddddddd"));
    await prune(f.root, 1, 7);
    assert.ok(!readdirSync(f.root).includes(old));
    for (const name of [newer, corrupt, "unrelated", ".incomplete-dddddddd"])
      assert.ok(readdirSync(f.root).includes(name));
    const recent = await f.create("20990101T000000Z", "eeeeeeee");
    const recent2 = await f.create("20990102T000000Z", "ffffffff");
    await prune(f.root, 1, 7);
    assert.ok(readdirSync(f.root).includes(recent));
    assert.ok(readdirSync(f.root).includes(recent2));
  } finally {
    f.clean();
  }
});

test("backup validation rejects traversal, incomplete members and symlink targets", async () => {
  const f = fixture();
  try {
    await assert.rejects(finalize(f.root, "../escape", "anything"));
    const name = await f.create("20260905T000000Z", "aaaaaaaa");
    const linked = "rusutsu-db-20260905T000001Z-bbbbbbbb";
    symlinkSync(path.join(f.root, name), path.join(f.root, linked));
    await assert.rejects(verifyGeneration(f.root, linked));
    chmodSync(path.join(f.root, name, "database.dump"), 0o600);
    rmSync(path.join(f.root, name, "archive.list"));
    await assert.rejects(verifyGeneration(f.root, name), /Incomplete/);
  } finally {
    f.clean();
  }
});
