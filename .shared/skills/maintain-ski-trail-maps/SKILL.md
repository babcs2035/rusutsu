---
name: maintain-ski-trail-maps
description: 全スキー場のゲレンデマップ（SkiResortLinks の mapUrls）と掲載元URL（mapPageUrls）を点検し、詳細画面で表示できない・小さすぎる・枠に合わない図、年度が変わって古くなった図、2枚以上登録された図、マップ未登録のスキー場を見つけて、公式の現行マップへ更新する。「ゲレンデマップを点検して」「マップが古くないか調べて」「マップが表示されないのを直して」「マップの無いスキー場を探して」「ゲレンデマップURLを更新して」のような依頼で使う。古さの判定は掲載元ページと画像の指紋をスクリプトで比べ、エージェントは指摘が出た施設だけを見る。
---

# ゲレンデマップの点検・更新

詳細画面の「ゲレンデマップ」に出る公式マップを、表示できる・見やすい・今季のものに保つ。
1スキー場につき1枚。迷う判断は人に聞く。

## 正本と参照先

このSkillの正本は `.shared/skills/maintain-ski-trail-maps/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| どの図を選ぶか・人に聞く条件 | `references/selection-rules.md` |
| 機械点検の指摘の意味、古さ・崩れの見分け方 | `references/checks.md` |
| 担当エージェントへの依頼文と決定ファイルの形 | `references/agent-brief.md` |
| 点検・候補抽出・実画面測定・一覧画像・反映 | `scripts/trail-map.mjs`（`check` / `scan` / `render` / `sheet` / `apply`） |

データ:
- 正本: 本番の DataDocument `SkiResortLinks.json`（`.env.local` の `DATA_API_BASE_URL` と管理トークンで読み書き）。
  リポジトリの `src/private/data/SkiResortLinks.json` は古い同梱版なので読まない・書かない。
- 前回の指紋: `src/private/data/trail-map-watch/state.json`（Git管理。点検のたびに更新）。
- 作業領域: `src/private/data/resorts-temporary/tmp/trail-map-audit/<run-id>/`（Git管理外）。
- 反映記録: `src/private/data/resort-map-audit/<日付>-trail-maps/applied.json`（バックアップの場所も記録）。

## モデルと分担

プロジェクトの `AGENTS.md` のコスト方針に従う（Claude Code では `sonnet`）。

| 作業 | 担当 | 成果物 |
| --- | --- | --- |
| 全件の機械点検・前回との比較・仕事の切り分け | 親（`check`） | report.json、summary.md、tasks.json |
| 1バッチ（最大10施設）の判断・マップ探し | サブエージェント sonnet / low（`find` で探索が深いときは medium） | `decisions/<batch>.json` |
| 決定の目視確認 | 親（`sheet` の一覧画像1枚で見る） | 採否 |
| 反映前の機械監査（取得できる・画像かPDF・掲載元に載っている・1枚） | 親（`apply` が自動で行う） | プレビュー |
| 本番反映・反映後の実画面確認 | 親（`apply --apply`、`check --ids`、`render --ids`） | 反映記録、render.json |
| `needs-human` の取りまとめ | 親 → ユーザー | 質問の一覧（各行にURL） |

同時に動かすのは最大2体。点検・照合・寸法測定はスクリプトで行い、エージェントにページのHTMLを読ませない。
エージェントが画像を見るのは、候補を `sheet` で1枚にまとめたときだけ。

## 手順

1. **点検する。** 全件（または `--ids a,b`）:

   ```bash
   node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs check \
     --run src/private/data/resorts-temporary/tmp/trail-map-audit/<run-id>
   ```

   約500施設で数分〜十数分。summary.md で状態ごとの件数と指摘を見る。
   試しに動かすときは `--no-state` を付けて前回の指紋を書き換えない。

2. **実画面でも測る（表示の崩れの依頼のとき、または指摘が多いとき）。**

   ```bash
   node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs render \
     --from <run>/report.json --status broken,display-warn --run <run>
   ```

   NGの施設は `screens/` にPC・スマホのスクリーンショットが残る。全施設で同じように崩れる（枠の作り・中継の
   エラー表示など画面側の原因）なら、データでは直さず、親が画面の実装を直す（`docs/ui-guidelines.md` を読んでから）。

3. **担当に振る。** `tasks.json` のバッチを `references/agent-brief.md` の依頼文で1つずつ渡す。
   優先順は `broken` → `stale-suspect` → `display-warn`（`map-multiple` を含む）→ `find`（アクティブ優先）。
   1体が返ったら次のバッチを渡し、全バッチが終わるまで止めない。

4. **決定を確かめる。** バッチごとに:
   - `sheet --decisions <run>/decisions/<batch>.json --out <run>/sheets/<batch>.jpg` で、採る図を1枚の画像にして見る。
     コース名が入っているか、そのスキー場の全体図か、年度。おかしい施設は担当に差し戻すか自分で直す。
   - `apply --decisions <file>`（確認だけ）で、差分・飛ばした施設・機械監査の問題を見る。
     問題があれば決定ファイルを直す。

5. **反映する。** 依頼が「調べて」だけなら反映しない（summary と決定をまとめて報告）。更新まで依頼されていれば:

   ```bash
   node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs apply --decisions <file> --apply
   node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs check --ids <反映した施設>
   node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs render --ids <反映した施設> --shots
   ```

   反映は正本のハッシュ一致を条件に書き、読み戻しまで確かめる。`check` で指摘が消えたこと、`render` で
   PC・スマホとも枠に収まって表示されることを確かめ、スクリーンショットを少なくとも数件は自分で見る。
   PDFは headless では描かれないので、PDFを採った施設は `render --ids <id> --shots --chrome`（実際の Chrome）で撮って見る。
   `no-change` で `accept: true` の施設は `check --ids <id> --accept <id>` で前回の指紋に入れる。

6. **人に聞く。** `needs-human` を集め、施設ごとに「質問1文＋候補のURL＋掲載ページのURL」でユーザーに聞く。
   答えをもらったら決定ファイルに書き、手順4から続ける。

## 完了報告

チャットで、1項目1文の箇条書き。

- 点検した件数と状態ごとの件数（直す前 → 直した後）
- 反映した施設と内容（差し替え・1枚に絞った・新規・掲載元の付け替え）。施設ごとに新しいマップのURL
- 実画面で確認した施設と画面（PC・スマホ）、確認していない範囲
- 見つからなかった施設の件数（無いとは断定しない）
- 人に聞きたいこと（各行にURL）
- 画面側の原因で、データでは直せない崩れ
