# 担当エージェントへの依頼（1バッチ＝最大10施設）

親は `tasks.json` から1バッチを取り出し、下の依頼文の `{…}` を埋めて渡す。
会話履歴・report.json全体・HTMLは渡さない。Claude Code では `model: "sonnet"`。

## 依頼文

```
ゲレンデマップの{review|find}を担当してください。リポジトリ: /Users/kohei/workspace/rusutsu（ルートで実行）。
判断基準: .shared/skills/maintain-ski-trail-maps/references/selection-rules.md を最初に読む。
対象（機械点検の結果）: {tasks.json のこのバッチの resorts をそのまま貼る}

道具（ページのHTMLやDOMを自分で読まない。これらの出力だけで判断する）:
- 掲載ページの候補: node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs scan <ページURL> --size [--check <登録中URL>]
  候補（URL・ラベル・推定年度・寸法）と、ゲレンデ・コース関係のリンク一覧が出る。
- 図の見比べ: node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs sheet --out {run}/sheets/<id>.jpg <URL> <URL> ...
  出力のjpgを Read で見る。1施設1枚まで。コース名が図に入っているか・全体図か・年度表記をここで確かめる。
- ページが見つからないときだけ WebSearch（「<スキー場名> ゲレンデマップ」）。結果は公式ドメインに限る。

やること:
- review: 指摘を読み、登録中の図を残すか、掲載元の候補へ差し替えるか、1枚に絞るかを決める。
- find: 公式サイト（officialSiteUrls）から、ゲレンデ・コース案内のページを2〜3階層までたどってマップを探す。
  見つからなければ not-found。無いことの断定はしない（「確認した範囲に無い」）。
- 1スキー場の mapUrls は必ず1枚。決めきれなければ needs-human。

出力: {run}/decisions/{batch}.json に次の形で書き、チャットには件数と needs-human の一覧だけ返す。
```

## 決定ファイルの形

```json
{
  "batch": "review-01",
  "decisions": [
    {
      "id": "hoshino-resorts-tomamu",
      "action": "replace-map",
      "expect": {
        "mapUrls": ["https://…/map2025.pdf", "https://…/course-map01.png"],
        "mapPageUrls": ["https://…/ski-slope/#tab-content1"]
      },
      "mapUrls": [{ "url": "https://…/map2627-jp-02.pdf", "description": "ゲレンデマップ画像/PDF / 2026-27（ファイル名）" }],
      "mapPageUrls": [{ "url": "https://www.snowtomamu.jp/winter/ski/ski-slope/", "description": "ゲレンデマップ掲載ページ" }],
      "reason": "登録中の2枚は掲載元から消えた。今季版のうちコース名入りはPDFだけ（画像はコース番号のみ）",
      "evidence": ["https://www.snowtomamu.jp/winter/ski/ski-slope/"]
    }
  ]
}
```

- `action`: `replace-map`（差し替え）/ `reduce-to-one`（2枚以上を1枚に）/ `add-map`（新規）/ `set-page`（掲載元だけ直す）/
  `no-change`（今のままで良い。理由を書く）/ `not-found` / `needs-human`。
- `expect`: 調査を始めたときに登録されていたURL（tasks.json の maps・mapPageUrls）。反映時に食い違えばその施設は飛ばす。
- `mapUrls`・`mapPageUrls`: 反映後の**全体**。変えない項目は書かない。`mapUrls` は1件だけ。
- 掲載元ページに載っていない直リンク（PDFを別ドメインのCDNに置いている等）は `"allowUnreferenced": true` と理由を書く。
- `needs-human` は `question`（何を決めてほしいか1文）と `options`（候補ごとに URL と一言）を書く。
- `no-change` で、指摘（`map-small` 等）が残るが他に良い図が無いときは `"accept": true` を付ける（次回から同じ指摘で止まらない）。
