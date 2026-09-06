import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { BundledFileDataDocumentSource } from "./bundledFileSource";
import { hashDataDocumentContent } from "./repositoryCore";

let root = "";
let outside = "";

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "data-document-bundled-"));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), "data-document-outside-"));
  await fs.mkdir(path.join(root, "group"), { recursive: true });
  await fs.writeFile(path.join(root, "root.json"), '{"root":true}\n', "utf8");
  await fs.writeFile(
    path.join(root, "group", "map.geojson"),
    '{"type":"FeatureCollection","features":[]}',
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "group", "ignored.txt"),
    "ignored",
    "utf8",
  );
  await fs.writeFile(path.join(outside, "secret.json"), "secret", "utf8");
  await fs.symlink(
    path.join(outside, "secret.json"),
    path.join(root, "group", "escape.json"),
  );
});

after(async () => {
  await Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true }),
  ]);
});

test("reads JSON text with a deterministic hash and bundled version", async () => {
  const source = new BundledFileDataDocumentSource(root);
  const document = await source.get("root.json");

  assert.equal(document?.content, '{"root":true}\n');
  assert.equal(document?.mediaType, "application/json");
  assert.equal(document?.hash, hashDataDocumentContent('{"root":true}\n'));
  assert.equal(document?.version, 0);
  assert.equal(document?.source, "bundled");
});

test("lists JSON and GeoJSON under a prefix without following symlinks", async () => {
  const source = new BundledFileDataDocumentSource(root);
  const documents = await source.list("group/");

  assert.deepEqual(
    documents.map(document => document.key),
    ["group/map.geojson"],
  );
  assert.equal(documents[0]?.mediaType, "application/geo+json");
  assert.equal(await source.get("group/escape.json"), null);
  assert.equal(await source.get("group/ignored.txt"), null);
});
