# 担当エージェントへの依頼（1バッチ＝最大3スキー場）

親は `prepare` を済ませ、下の依頼文の `{…}` を埋めて渡す。会話履歴・ページのHTMLは渡さない。Claude Code では `model: "sonnet"`。

## 依頼文

```
スキー場の公式リンクの収集を担当してください。リポジトリ: /Users/kohei/workspace/rusutsu（ルートで実行）。
最初に読む: .shared/skills/collect-ski-resort-official-links/references/link-types.md（種類ごとの載せ方）
対象と材料: {run}/brief/{id}.json （スキー場ごとに1つ。公式サイト、集める種類、他で管理中のURL、前回の結果）

やること（スキー場ごと）:
- 公式サイト（officialSites）のトップ・メニュー・サイトマップから、集める種類（typesToCollect）のページを探す。
  ownedElsewhere のURLは集める対象ではないが、同じサイトの入口の手がかりになる。
- 載せるのは、公式サイトのページと、公式ページに張られているリンクだけ。検索エンジンや外部サイトから探さない。
  公式サイト以外のURLを載せるときは、そのリンクがあった公式ページを foundOn に書く。
- ページは実際に開いて内容を読む（WebFetch。JSで描画されるページは Playwright）。メニューの名前だけで決めない。
- typesToCollect のどの種類にも、found / none / unchecked のどれかを最低1件書く。
- previous（前回の結果）があれば出発点にしてよい。URLが今も同じ内容かは開いて確かめる。
- リンクが開けるか・飛び先の位置は、後で親がスクリプトで確かめる。quote（該当箇所の見出し）を正確に写すことに集中する。
- 他の担当のURLの間違い・抜け（SNSの未登録アカウント、切れた公式URLなど）に気づいたら legacyFindings に書く。

出力: src/private/data/resort-links/{id}.json を下の形で書き、次で形式を検査して OK になるまで直す。
  node --import tsx scripts/publishResortLinks.ts --official {id} {id} --check
チャットにはスキー場ごとの found / none / unchecked の件数と、迷った点だけ返す。
```

## 収集ファイルの形

```json
{
  "resortId": "rusutsu-resort",
  "checkedAt": "2026-11-12",
  "officialSites": ["https://rusutsu.com/"],
  "items": [
    { "type": "carAccess", "status": "found", "label": "札幌",
      "url": "https://rusutsu.com/by-car/", "quote": "札幌から" },
    { "type": "restaurant", "status": "found",
      "url": "https://rusutsu.com/dining/", "quote": "スキー場", "note": "ゲレンデ内の店の一覧" },
    { "type": "externalDiscount", "status": "found", "category": "presale", "label": "楽天チケット",
      "url": "https://leisure.tstar.jp/event/rlosrkn/", "foundOn": "https://www.osorakan.co.jp/winter/ticket/" },
    { "type": "parkStatus", "status": "none", "note": "当日の状況はInstagramだけで発信" },
    { "type": "busTour", "status": "unchecked", "note": "アクセスページがメンテナンス中で開けなかった" }
  ],
  "legacyFindings": [
    { "type": "instagram", "url": "https://www.instagram.com/example_park/",
      "foundOn": "https://example.com/park/", "note": "パーク専用アカウント。未登録" }
  ],
  "notes": ["コース紹介は英語ページのほうが詳しいが、日本語ページを載せた"]
}
```

- `items` は `linkTypes.json` の種類の順に並べる。同じ種類の中は、利用者が探しやすい順（主要な出発地から、など）。
- `url` はそのページのURL。元から `#id` で場所を指せるなら付けてよい。`#:~:text=` は書かない（親のスクリプトが決めて `jumpUrl` に入れる）。
- `status` が `none` / `unchecked` の項目に `url` は書かない。理由は `note` に書く。
- `checkedAt` は調べた日。`officialSites` は実際に調べたサイト（brief と違うときは `notes` に理由）。
