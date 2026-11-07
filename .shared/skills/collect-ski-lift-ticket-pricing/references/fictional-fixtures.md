# 架空スキー場フィクスチャと特徴照合

`docs/plans/lift-ticket-duration-test-cases.md` の架空ケースを、実在施設と同じ形式の料金JSONにしたもの。
目的は「実在施設にあって架空ケースに無い構造」を機械的に警告すること（文書の Y01〜Y05）。

## 置き場所

- `tests/fixtures/fictional/<resort>.json` — 架空スキー場の本体。文書の「架空スキー場A」「B」…「RS」「YM」に対応する
  完全な料金JSON（schema・taxonomy・coverage の3スクリプトを通ること）。`resort.id` は `fictional-<小文字>`（例 `fictional-a`、`fictional-ym`）。
- `tests/fixtures/fictional/variants/<CASE_ID>.json` — 行単位のケース（K01・W05・CH21・Q06・YM30 など）。
  基準スキー場に差分を当てた「1行ぶんの架空施設」。形式:

```json
{
  "case_id": "K01",
  "doc_section": "K",
  "base": "a",
  "note_ja": "6時間・8時間・9時間券と1日券で7時間を照会する",
  "merge": { "operating_hours": [ ... 配列は丸ごと置き換え ... ] },
  "append": { "products": [ ... 末尾に追加 ... ], "offers": [ ... ] },
  "remove": { "products": ["four-hour-pass"], "offers": ["offer-four-hour-adult"] }
}
```

- `merge`: 深いマージ。オブジェクトは再帰、配列とスカラーは置き換え。
- `append`: 配列の末尾に追加（`products` / `offers` / `rentals` / `party_rules` / `fees` / `calendars` / `audiences` / `rental_audiences` / `operating_hours` / `channels` / `sources`）。
- `remove`: `id` の配列。該当IDの要素を配列から削除する。
- 適用順は remove → merge → append。結果のJSONも3スクリプトを通ること。
- 1つの行が複数の構造を含むなら、その行のIDで1ファイル。構造を足さない行（期待値だけが違う行）は作らない。

## 特徴の抽出

`scripts/lift-ticket-features.mjs` の `extractFeatures(data)` が、料金JSONから特徴キーの集合を返す。
実在施設にも架空施設にも同じ関数を使う（Y01）。特徴キーは `分野:名前=値` の文字列
（例 `product:validity.mode=hours`、`rental:duration.mode=extra_day:after_days=1`、`audience:default_has_age_max`、
`yukimaji:free.day_rule=by_period`）。キーの一覧と意味は `references/feature-catalog.md` に書く。
自由記述（`notes_ja`）は抽出しない。正規表現で読む特徴（証明の種類など）は「上限として読む」と catalog に明記する。

## 照合

`scripts/check-fictional-coverage.mjs`:

```bash
# 全実在施設をまとめて照合（CI）
node scripts/check-fictional-coverage.mjs --real src/private/data/lift-ticket --fictional tests/fixtures/fictional
# 1施設だけ（料金収集で保存したとき）
node scripts/check-fictional-coverage.mjs --real src/private/data/lift-ticket/<slug>/<season>.json --fictional tests/fixtures/fictional
```

- 架空施設（本体＋variants）の特徴の和集合を作り、各実在施設の特徴との差を出す。
- 差があれば `<slug>: <特徴キー>（架空ケースなし）` を1行ずつ出し、終了コード1（Y02）。
- `references/coverage-acknowledged.json` に `{ "feature": "...", "reason_ja": "...", "cases": ["K01"] }` で載っている特徴は失敗にしない。`reason_ja` が空なら失敗（Y03）。
- スキーマ外のフィールド・enum外の値は validate-lift-ticket.mjs の担当なので、ここでは扱わない（Y04 はそちら）。
- `--json` で機械可読な結果を出す。
- 架空施設側にだけある特徴は警告ではなく情報として出す（実在施設に無い型の架空ケース）。

## テスト（tests/run-tests.mjs）

- Y01: 実在・架空で同じ `extractFeatures` を使っている（関数が1つ）。
- Y02: 架空施設から特徴を1つ持つ要素を外したコピーで照合すると、その特徴を持つ実在施設（または fixture）が警告に出る（Y05 の変異テスト）。
- Y03: acknowledged の `reason_ja` が空なら失敗する。
- fictional の全JSON（variants を適用した結果を含む）が schema・taxonomy・coverage の3スクリプトを通る。
