# 担当への依頼文

`text_changed` / `missing_in_json` の施設を、最大10施設ずつ渡す。`<…>` を埋めて使う。

```text
担当: 次のスキー場のリフト券JSONの `yukimaji`（雪マジ）欄を、雪マジの最新掲載に合わせて更新する草案を作る。本番反映はしない。

対象と、掲載文の変化: <run>/report.json の rows（state が text_changed / missing_in_json、resort_id が <ids>）。
確定版: src/private/data/lift-ticket/<id>/<season>.json

手順:
1. .shared/skills/collect-ski-lift-ticket-pricing/SKILL.md の「Stage 1b: 雪マジの取得」と、
   references/data-model.md の「## yukimaji（雪マジ）」を読み、その書き方に従う。
2. 各施設の jalan.net 詳細ページ（yukimaji.majibu_url、無ければ report の施設番号）を開き、
   「特典内容」「対象期間・時間」「料金について」「レンタル・他料金」「注意事項」を確かめる。
   一覧の掲載文は要約なので、詳細ページを正とする。取得物は <run>/sources/<id>/ に保存する。
3. 確定版をコピーして <run>/drafts/<id>.json を作り、yukimaji と雪マジの出典（sources の取得日）だけを変える。
   確定版は書き換えない。本番に残る欄（notes_ja など）に作業領域のパスを書かない。
4. 機械検証を通す（リポジトリのルートで）:
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/validate-lift-ticket.mjs <draft>
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/check-taxonomy.mjs <draft>
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/check-lift-ticket-coverage.mjs <draft>
   ERROR は直す。今回の変更と無関係な既存の WARNING は残してよい。

返すもの: 施設ごとに変えた項目と根拠（詳細ページの該当文）、草案パス、検証結果、判断に迷った点。
```
