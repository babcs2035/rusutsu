import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureHeadline, FeatureTags } from "./FeatureHeadline";

test("レベル・圧雪はラベルなしの値チップにする", () => {
  const text = renderToStaticMarkup(
    createElement(FeatureTags, {
      difficulty: { label: "初級", color: "#22C55E" },
      grooming: "一部圧雪",
    }),
  ).replace(/<[^>]+>/g, "");
  assert.equal(text, "初級一部圧雪");
});

test("営業状況は記号つきチップを一度だけ出し、出典は掲載名の箇所へ飛ばす", () => {
  const html = renderToStaticMarkup(
    createElement(FeatureHeadline, {
      kind: "course",
      status: { symbol: "×", text: "クローズ" },
      sources: [
        {
          urls: ["https://example.com/status"],
          update: "2026/4/2 8:04 更新",
          matches: [
            { mapName: "林間（上部）", officialNames: ["林間A"] },
            { mapName: "林間（下部）", officialNames: ["林間B"] },
          ],
        },
      ],
    }),
  );
  const text = html.replace(/<[^>]+>/g, "");
  assert.equal((text.match(/クローズ/g) ?? []).length, 1);
  assert.doesNotMatch(text, /営業状況|掲載名|林間A|日時不明/);
  assert.match(
    html,
    /href="https:\/\/example.com\/status#:~:text=%E6%9E%97%E9%96%93A&amp;text=%E6%9E%97%E9%96%93B"/,
  );
  assert.match(text, /2026\/4\/2 8:04現在/);
});
