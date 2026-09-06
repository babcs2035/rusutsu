import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readImportMode } from "./canonicalImportRuntime";
import {
  collectImportDocuments,
  hashContent,
  shortNameSourceSchema,
} from "./canonicalImportSources";

test("import CLI requires explicit initialization or read-only preflight", () => {
  assert.equal(readImportMode(["--dry-run"]), "--dry-run");
  assert.equal(readImportMode(["--", "--initialize"]), "--initialize");
  for (const args of [[], ["--force"], ["--dry-run", "--initialize"]])
    assert.throws(() => readImportMode(args));
});

test("validates every JSON/GeoJSON source and hashes exact UTF-8 content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rusutsu-import-"));
  try {
    const content = '{"日本語":"value"}\n';
    await fs.writeFile(path.join(root, "sample.json"), content);
    const documents = await collectImportDocuments(root, ["sample.json"]);
    assert.equal(documents[0]?.content, content);
    assert.equal(documents[0]?.hash, hashContent(content));
    await assert.rejects(
      collectImportDocuments(root, ["sample.json", "sample.json"]),
      /Duplicate/u,
    );
    await assert.rejects(collectImportDocuments(root, ["../sample.json"]));
    await fs.writeFile(
      path.join(root, "broken.geojson"),
      '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{}}]}',
    );
    await assert.rejects(
      collectImportDocuments(root, ["broken.geojson"]),
      /Invalid migration/u,
    );
    await fs.writeFile(path.join(root, "sample.json"), "null");
    await assert.rejects(
      collectImportDocuments(root, ["sample.json"]),
      /Invalid migration/u,
    );
    await assert.rejects(
      collectImportDocuments(root, ["missing.json"]),
      /ENOENT/u,
    );
    await fs.symlink(root, path.join(root, "linked"));
    await assert.rejects(
      collectImportDocuments(root, ["linked/sample.json"]),
      /Symlinks/u,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("short names reject missing, duplicate, oversized, or unsafe entries", () => {
  assert.deepEqual(
    shortNameSourceSchema.parse({
      resorts: [{ id: "rusutsu-resort", shortName: " ルスツ " }],
    }).resorts,
    [{ id: "rusutsu-resort", shortName: "ルスツ" }],
  );
  for (const resorts of [
    [],
    [{ id: "../bad", shortName: "name" }],
    [{ id: "valid", shortName: " " }],
    [{ id: "valid", shortName: "a".repeat(101) }],
    [
      { id: "same", shortName: "a" },
      { id: "same", shortName: "b" },
    ],
  ])
    assert.equal(shortNameSourceSchema.safeParse({ resorts }).success, false);
});
