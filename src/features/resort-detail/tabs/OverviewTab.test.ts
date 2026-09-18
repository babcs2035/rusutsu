import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Resort } from "../types";
import { OverviewTab, SnsTab } from "./OverviewTab";

test("営業状況とSNSを分離し、旧データでもそれぞれ描画できる", () => {
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
    const sns = renderToStaticMarkup(createElement(SnsTab, { resort }));
    assert.match(sns, /SNSアカウントは登録されていません/);
    assert.doesNotMatch(sns, /営業・気象情報/);
  }
});
