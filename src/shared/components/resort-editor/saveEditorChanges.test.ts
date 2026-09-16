import assert from "node:assert/strict";
import { test } from "node:test";
import { saveEditorChanges } from "./saveEditorChanges";

test("コース・リフトの最終保存にURLを含み、関連保存を待って完了する", async () => {
  const calls: string[] = [];
  const result = await saveEditorChanges({
    saveMapping: async () => {
      calls.push("mapping");
      return true;
    },
    saveLinks: async () => {
      calls.push("map URL");
      return ["SkiResortLinks.json"];
    },
    saveGeometry: async () => {
      calls.push("geometry");
      return { ok: true, writtenFiles: ["geometry.geojson"] };
    },
    mappingFile: "mapping.json",
  });
  assert.deepEqual(calls, ["mapping", "map URL", "geometry"]);
  assert.deepEqual(result, {
    ok: true,
    writtenFiles: ["geometry.geojson", "SkiResortLinks.json", "mapping.json"],
  });
});

test("リンク保存に失敗したら形状保存・保存完了へ進まない", async () => {
  await assert.rejects(
    saveEditorChanges({
      saveMapping: async () => true,
      saveLinks: async () => {
        throw new Error("URL保存失敗");
      },
      saveGeometry: async () => assert.fail("保存してはいけない"),
    }),
    /URL保存失敗/,
  );
});

test("対応表の保存失敗は関連データの保存を停止する", async () => {
  const result = await saveEditorChanges({
    saveMapping: async () => false,
    saveLinks: async () => assert.fail("保存してはいけない"),
    saveGeometry: async () => assert.fail("保存してはいけない"),
  });
  assert.equal(result.ok, false);
});
