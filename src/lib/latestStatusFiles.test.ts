import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  listResortIdsWithLatestStatus,
  selectLatestStatusFile,
} from "./latestStatusFiles";

let root = "";

const writeStatus = async (
  resortId: string,
  fileName: string,
  body: Record<string, unknown>,
) => {
  const directory = path.join(root, "latest_data", resortId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, fileName),
    JSON.stringify(body),
    "utf8",
  );
};

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "latest-status-"));

  // コースもリフトも取れている
  await writeStatus("both", "2026_0101_100000.json", {
    courses: [{ name: "メロディ", status: "○" }],
    lifts: [{ name: "第1クワッド", status: "○" }],
  });

  // クローラーはあるが、コースは空でリフトだけ取れている
  await writeStatus("lifts-only", "2026_0101_100000.json", {
    courses: [],
    lifts: [{ name: "ロープウェイ" }],
  });

  // 名前のない要素しかないので、取得できていない扱い
  await writeStatus("nameless", "2026_0101_100000.json", {
    courses: [{ status: "○" }],
    lifts: [{ status: "×" }],
  });

  // 新しいファイルが壊れていても、1 つ前まで遡って拾う
  await writeStatus("stale-newest", "2026_0101_100000.json", {
    courses: [{ name: "ジジ" }],
    lifts: [{ name: "ペア" }],
  });
  await fs.writeFile(
    path.join(root, "latest_data", "stale-newest", "2026_0102_100000.json"),
    "{ broken",
    "utf8",
  );

  // ディレクトリはあるがファイルが無い
  await fs.mkdir(path.join(root, "latest_data", "empty"), { recursive: true });
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test("selectLatestStatusFile picks the newest timestamped file", () => {
  assert.equal(
    selectLatestStatusFile([
      "2026_0101_100000.json",
      "2026_0102_100000.json",
      "readme.md",
    ]),
    "2026_0102_100000.json",
  );
  assert.equal(selectLatestStatusFile(["readme.md"]), null);
});

test("listResortIdsWithLatestStatus reports only kinds that actually got data", async () => {
  const result = await listResortIdsWithLatestStatus(root);

  assert.ok(result.courses.has("both"));
  assert.ok(result.lifts.has("both"));

  // クローラーはあるがコースは取れていないので courses には入れない
  assert.ok(!result.courses.has("lifts-only"));
  assert.ok(result.lifts.has("lifts-only"));

  assert.ok(!result.courses.has("nameless"));
  assert.ok(!result.lifts.has("nameless"));

  // 壊れた最新ファイルは読み飛ばして、その前のファイルから拾う
  assert.ok(result.courses.has("stale-newest"));
  assert.ok(result.lifts.has("stale-newest"));

  assert.ok(!result.courses.has("empty"));
  assert.ok(!result.lifts.has("empty"));
});

test("listResortIdsWithLatestStatus returns empty sets for a missing root", async () => {
  const result = await listResortIdsWithLatestStatus(
    path.join(root, "does-not-exist"),
  );
  assert.equal(result.courses.size, 0);
  assert.equal(result.lifts.size, 0);
});
