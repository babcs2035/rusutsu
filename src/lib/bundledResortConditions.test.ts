import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readBundledResortConditions } from "./bundledResortConditions";

test("保存結果は最新の有効JSONから日時・カテゴリ別出典を保持する", async () => {
  const parent = path.join(
    process.cwd(),
    "src/private/data/resorts-temporary/tmp/detail-redesign",
  );
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "conditions-"));
  try {
    const directory = path.join(root, "latest_data", "sample");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "2026_0917_120000.json"), "{");
    await fs.writeFile(
      path.join(directory, "2026_0917_110000.json"),
      JSON.stringify({
        time: "2026/9/17 11:00:00",
        weather: { 山麓: { temperature: 0 } },
        weatherUrl: ["https://example.com/weather"],
        comment: "営業終了",
        commentUrl: ["https://example.com/news"],
      }),
    );
    const result = await readBundledResortConditions("sample", root);
    assert.equal(result.weather?.time, "2026/9/17 11:00:00");
    assert.equal(result.weather?.archived, true);
    assert.deepEqual(result.weather?.sourceUrls, [
      "https://example.com/weather",
    ]);
    assert.deepEqual(result.comment?.sourceUrls, ["https://example.com/news"]);
    assert.deepEqual(await readBundledResortConditions("../sample", root), {
      weather: null,
      comment: null,
      news: null,
    });
    assert.deepEqual(await readBundledResortConditions("missing", root), {
      weather: null,
      comment: null,
      news: null,
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
