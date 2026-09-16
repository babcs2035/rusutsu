import assert from "node:assert/strict";
import { test } from "node:test";
import { updateSavedElevations } from "./elevationJob";

const document = {
  key: "slope_10m/test.geojson",
  hash: "saved",
  content: "{}",
};

test("標高取得前に再保存された版は処理しない", async () => {
  await updateSavedElevations(document, {
    read: async () => ({ hash: "newer" }),
    enrich: async () => {
      throw new Error("取得してはいけない");
    },
    write: async () => {
      throw new Error("保存してはいけない");
    },
  });
});

test("標高取得中に再保存されても保存時のhashで照合する", async () => {
  let hash = "saved";
  await assert.rejects(
    updateSavedElevations(document, {
      read: async () => ({ hash }),
      enrich: async () => {
        hash = "newer";
        return { type: "FeatureCollection", features: [] };
      },
      write: async documents => {
        assert.equal(documents[0].expectedHash, "saved");
        assert.notEqual(documents[0].expectedHash, hash);
        throw new Error("conflict");
      },
    }),
    /conflict/,
  );
});

test("取得失敗で保存済みデータを書き換えない", async () => {
  await assert.rejects(
    updateSavedElevations(document, {
      read: async () => ({ hash: "saved" }),
      enrich: async () => {
        throw new Error("標高取得失敗");
      },
      write: async () => assert.fail("書き込んではいけない"),
    }),
    /標高取得失敗/,
  );
});
