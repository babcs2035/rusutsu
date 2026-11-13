import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Resort } from "../types";
import { OverviewTab } from "./OverviewTab";

test("SNSアカウントを持つ旧データでも、営業状況だけを描画する", () => {
  // 実際に旧版が IndexedDB へ保存していた形。現行型へのキャストでは補完されない。
  for (const socialAccounts of [undefined, null, {}, { X: [] }]) {
    const resort = {
      id: "test",
      courses: [],
      lifts: [],
      finalizedMapData: null,
      socialAccounts,
    } as unknown as Resort;
    const html = renderToStaticMarkup(
      createElement(OverviewTab, {
        resort,
        showTerrainDetail: false,
        terrainTab: "コース",
        onShowTerrainDetail: () => {},
        onCloseTerrainDetail: () => {},
        selectedFinalizedFeature: null,
        onSelectedFinalizedFeatureChange: () => {},
      }),
    );
    assert.match(html, /営業・気象情報/);
    assert.doesNotMatch(html, /SNSアカウント/);
  }
});
