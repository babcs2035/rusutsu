import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  confirmLegacyBackup,
  finalize,
  migrateLegacyBackups,
  prune,
  verifyGeneration,
} from "./local-backup.ts";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "rusutsu-local-backup-"));
  return {
    root,
    async create(stamp: string, suffix: string, completionTime?: string) {
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
      const completedAt =
        completionTime ??
        new Date(
          `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
        ).toISOString();
      await finalize(root, temporary, name, completedAt);
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

test("retention keeps the seven newest verified generations by completion time", async () => {
  const f = fixture();
  try {
    const generations = [];
    for (let index = 1; index <= 9; index++) {
      generations.push(
        await f.create(`20260${index}01T000000Z`, `0000000${index}`),
      );
    }
    const corrupt = "rusutsu-db-20261201T000000Z-cccccccc";
    mkdirSync(path.join(f.root, corrupt), { mode: 0o700 });
    writeFileSync(path.join(f.root, corrupt, "database.dump"), "corrupt");
    mkdirSync(path.join(f.root, "unrelated"));
    mkdirSync(path.join(f.root, ".incomplete-dddddddd"));
    const retained = await prune(f.root);
    assert.deepEqual(retained, generations.slice(-7).reverse());
    const entries = readdirSync(f.root);
    assert.ok(!entries.includes(generations[0]));
    assert.ok(!entries.includes(generations[1]));
    assert.ok(entries.includes(corrupt));
    assert.ok(entries.includes("unrelated"));
    assert.ok(entries.includes(".incomplete-dddddddd"));
  } finally {
    f.clean();
  }
});

test("retention orders generations by completion metadata, not their names", async () => {
  const f = fixture();
  try {
    const laterNamedButEarlier = await f.create(
      "20260930T000000Z",
      "aaaaaaaa",
      "2026-09-01T00:00:00.000Z",
    );
    const earlierNamedButLater = await f.create(
      "20260901T000000Z",
      "bbbbbbbb",
      "2026-09-30T00:00:00.000Z",
    );
    assert.deepEqual(await prune(f.root, 1), [earlierNamedButLater]);
    assert.ok(!readdirSync(f.root).includes(laterNamedButEarlier));
    assert.ok(readdirSync(f.root).includes(earlierNamedButLater));
  } finally {
    f.clean();
  }
});

test("generated generation timestamp is taken from successful finalization", async () => {
  const f = fixture();
  try {
    const temporary = ".incomplete-aaaaaaaa";
    mkdirSync(path.join(f.root, temporary), { mode: 0o700 });
    writeFileSync(path.join(f.root, temporary, "database.dump"), "PGDMP");
    writeFileSync(path.join(f.root, temporary, "archive.list"), "archive");
    const name = await finalize(
      f.root,
      temporary,
      undefined,
      "2026-09-05T12:34:56.789Z",
    );
    assert.equal(name, "rusutsu-db-20260905T123456Z-aaaaaaaa");
    const metadata = await verifyGeneration(f.root, name);
    assert.equal(metadata.createdAt, "2026-09-05T12:34:56.789Z");
  } finally {
    f.clean();
  }
});

test("failed finalization does not prune completed generations", async () => {
  const f = fixture();
  try {
    const prior = await f.create("20260905T000000Z", "aaaaaaaa");
    const temporary = ".incomplete-bbbbbbbb";
    mkdirSync(path.join(f.root, temporary), { mode: 0o700 });
    writeFileSync(path.join(f.root, temporary, "database.dump"), "PGDMP");
    await assert.rejects(
      finalize(f.root, temporary, "rusutsu-db-20260906T000000Z-bbbbbbbb"),
      /invalid/i,
    );
    assert.ok(readdirSync(f.root).includes(prior));
    assert.ok(readdirSync(f.root).includes(temporary));
  } finally {
    f.clean();
  }
});

test("legacy migration copies and verifies before source removal confirmation", async () => {
  const source = fixture();
  const target = fixture();
  try {
    const generation = await source.create("20260905T000000Z", "aaaaaaaa");
    const corrupt = await source.create("20260904T000000Z", "bbbbbbbb");
    writeFileSync(path.join(source.root, corrupt, "database.dump"), "corrupt");
    mkdirSync(path.join(source.root, "unrelated"));

    assert.deepEqual(await migrateLegacyBackups(source.root, target.root), [
      generation,
    ]);
    await verifyGeneration(target.root, generation);
    assert.ok(readdirSync(source.root).includes(generation));
    assert.ok(readdirSync(source.root).includes(corrupt));
    assert.ok(readdirSync(source.root).includes("unrelated"));
    assert.deepEqual(await migrateLegacyBackups(source.root, target.root), [
      generation,
    ]);
    await confirmLegacyBackup(source.root, target.root, generation);
    assert.ok(!readdirSync(source.root).includes(generation));
  } finally {
    source.clean();
    target.clean();
  }
});

test("legacy migration leaves a conflicting source generation untouched", async () => {
  const source = fixture();
  const target = fixture();
  try {
    const generation = await source.create("20260905T000000Z", "aaaaaaaa");
    await target.create("20260905T000000Z", "aaaaaaaa");
    writeFileSync(
      path.join(target.root, generation, "database.dump"),
      "different dump",
    );
    await assert.rejects(
      migrateLegacyBackups(source.root, target.root),
      /checksum|conflicting/i,
    );
    assert.ok(readdirSync(source.root).includes(generation));
  } finally {
    source.clean();
    target.clean();
  }
});

test("legacy migration does not prune until a new backup is finalized", async () => {
  const source = fixture();
  const target = fixture();
  const individual = [];
  try {
    const generations = [];
    for (let index = 1; index <= 8; index++) {
      const one = fixture();
      individual.push(one);
      const name = await one.create(
        `20260${index}01T000000Z`,
        `0000000${index}`,
      );
      generations.push(name);
      renameSync(path.join(one.root, name), path.join(source.root, name));
    }

    assert.equal(
      (await migrateLegacyBackups(source.root, target.root)).length,
      8,
    );
    const copied = readdirSync(target.root).sort();
    assert.deepEqual(copied, generations.sort());
  } finally {
    source.clean();
    target.clean();
    for (const one of individual) one.clean();
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
