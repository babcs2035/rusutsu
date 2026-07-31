---
name: collect-ski-lift-ticket-pricing
description: ユーザー指定の公式URLから、利用日を指定して購入するリフト券（日券・時間券・回数券・複数日券・セット券等）の料金と適用条件を収集・監査し、1スキー場×1シーズン×1JSONへ整理する。シーズン券とその購入者・保有者向け特典は対象外。「リフト券料金を収集して」「lift-ticket JSONを作成・更新・監査して」「日付・人物区分から料金を照会して」の依頼で使う。URL登録は src/private/data/lift-ticket-source/{ski-resort-id}.json、証拠と出力は src/private/data/lift-ticket/ 配下、照会は scripts/lookup-price.mjs を使う。
---

# リフト券料金の収集・監査

ユーザー指定の公式情報だけを根拠に、リフト券料金を共通JSONへ整理する。
推測せず、取得＋抽出と独立監査を分ける。

## 正本と参照先

このSkillの正本は `.shared/skills/collect-ski-lift-ticket-pricing/`。
`.agents/skills/` と `.claude/skills/` はシンボリックリンクなので編集しない。

| 必要なとき | 読むもの |
| --- | --- |
| 抽出・データ編集 | `references/data-model.md`、`references/extraction-rules.md`、`references/taxonomy.json`、`templates/lift-ticket.template.json` |
| 書き方に迷ったとき | `references/examples.md` |
| 独立監査 | `references/extraction-rules.md` の監査チェックリスト、`references/taxonomy.json` |
| 構造検証 | `scripts/validate-lift-ticket.mjs`（モデルはSchemaを直接読まない） |

主要パス:

```text
src/private/data/lift-ticket-source/{resort-id}.json
src/private/data/lift-ticket/{resort-id}/sources/{season-id}/
src/private/data/lift-ticket/{resort-id}/tickets/{season-id}.draft.json
src/private/data/lift-ticket/{resort-id}/tickets/{season-id}.json
src/private/data/lift-ticket/{resort-id}/audits/{season-id}.audit.json
```

## 対象範囲

収集する:

- 日券、時間券、回数券、ナイター券、複数日券、共通券、滑走用セット券
- 通常料金、無料料金、Web・前売・会員・宿泊者・障がい者等の条件付き料金
- 利用期間、販売期間、購入期限、購入経路、対象者、必要証明、必須手数料
- 営業時間、ナイター営業日、定休日

収集しない:

- シーズン券と、その購入者・保有者だけの特典
- 観光用ゴンドラ券など滑走を目的としない券
- 駐車料金、キャンセル料、再発行手数料など通常購入額でない費用
- 返金されるICカード保証金

## 絶対ルール

1. 公式資料にない金額・年齢・学校区分・日付・条件を推測しない。
2. 1スキー場×1シーズン×1JSONとし、別シーズンを混ぜない。
3. 情報源は登録URL、そこから辿れる同一公式ドメイン内の1階層のリンク、
   ユーザーが明示した追加URLだけ。検索エンジンで情報源を増やさない。
4. 確定情報には保存資料を指す `source_refs` を付ける。
5. 分類ラベルは `references/taxonomy.json` だけを正本とし、独断で追加しない。
6. 不明点は `unknown`、`unresolved_questions`、または
   `human_review_required` に理由と確認場所を残す。
7. 保存資料はフォーマッタで変更しない。JSON修正は該当箇所だけ差分編集する。

## 人物区分と料金表示の必須挙動

詳細は `references/data-model.md` の `audiences` / `offers` を正本とする。

- どの人物条件にも当てはまらない基準区分を `is_default: true` で1件置く
  （通常は大人）。
- 公式に対象者区分が書かれていないofferは `audience_ids` を空にせず、
  基準区分へ紐付ける。
- 障がい者本人・公式に対象となる介護者の料金は、専用audienceに
  `is_disability_qualified: true` と `base_audience_id` を設定する。
  障がい者として検索した場合は専用料金を適用し、該当する専用料金がなければ
  `base_audience_id` の通常料金を表示する。
- 「20才」等の年齢名と年度単位の生年月日範囲が併記された割引は、
  その年齢で検索したときに適用し、公式の生年月日範囲を警告表示できるよう
  検索用年齢を `target_qualification.nominal_age`、公式の生年月日範囲を
  `target_qualification.official_label_ja` に保存する。
- 通常料金を基準表示し、宿泊者・会員等の入力だけでは確定できない割引は
  条件とともに別掲する。ただし、適用済み合計以上になる候補は表示しない。
- `special_day` のうち、calendar・audienceだけで対象が確定し、追加資格・提示物・
  事前購入条件がない料金は自動適用する（例: 土曜日の小学生向けこどもデー）。

## Stage 1: 取得＋抽出

サブエージェントが利用可能なら、取得＋抽出担当と監査担当を分ける。
抽出担当に監査を兼任させない。

1. 入力を確認する:
   - 既存マスタと一致するスキー場ID
   - スキー場名
   - 対象シーズン
   - 公式URL一覧
   - 新規作成 / 更新 / 監査のみ
2. URL未登録なら
   `src/private/data/lift-ticket-source/{resort-id}.json` へ登録する。
   URLはシーズンに紐付けず、1スキー場1ファイルで管理する。
3. 登録URLを取得する:

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/capture-sources.mjs \
     --resort <resort-id> --season <season-id> --from-registry
   ```

4. `manifest.json` と各 `metadata.json` で取得成功・公式ドメイン・保存先を確認する。
5. 保存資料を次の順で読む:
   - `visible-text.txt`
   - `tables.md`（表の金額はここで確定）
   - `screens/*.jpg` の全タイル（画像内料金・脚注を確認）
   - 必要なPDF・料金画像
6. 必要な公式リンク先は `--url` / `--download` と `--linked-from` で追加取得する。
7. `manifest.json.season_check.verdict` が `match` でなければ抽出を止める。
   人間が公式資料から確定した場合だけ `--accept-season` を使う。
8. テンプレートから `{season-id}.draft.json` を作り、資料にある情報だけを記録する。
9. 機械検証3本を通す:

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/validate-lift-ticket.mjs <draft.json>
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/check-taxonomy.mjs <draft.json>
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/check-lift-ticket-coverage.mjs <draft.json>
   ```

## Stage 2: 独立監査

監査担当には保存資料・草案JSON・監査チェックリスト・taxonomyだけを渡す。
抽出担当の思考過程や申し送りを渡さない。

最低限、次を独立に確認する:

- 表の行列と金額、画像内料金、PDF脚注
- 年齢・学校区分・対象日・販売経路・購入期限
- 全確定情報の `source_refs`
- 条件付き料金の対象者と証明条件
- 障がい者audienceと通常料金へのフォールバック
- 動的価格、保証金、手数料、共通券、セット内容
- シーズン券や保有者限定特典の混入

監査結果を `{season-id}.audit.json` に保存する:

```json
{
  "status": "passed | failed | needs_review",
  "errors": [],
  "warnings": [],
  "missing_evidence": [],
  "possible_misreads": [],
  "taxonomy_addition_candidates": [],
  "suggested_fixes": []
}
```

## 最終統合と照会テスト

1. メイン担当が監査指摘の根拠を確認し、草案を差分修正する。
2. 機械検証3本を再実行し、通過した草案を本番JSONへ確定する。
3. `scripts/lookup-price.mjs` で最低5シナリオを確認する:
   - 平日、休日、年末年始、特定日
   - 年齢・学校区分
   - 通常料金と条件付き料金
   - 障がい者専用料金と、専用料金がない券種の通常料金フォールバック
   - 年齢世代割引の適用と生年月日警告

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/lookup-price.mjs \
     <tickets/.../{season-id}.json> --date YYYY-MM-DD --audience <audience-id> --json
   ```

4. 答えられない事項は、資料にあれば抽出漏れとして修正し、資料になければ
   `unresolved_questions` へ記録する。

## human_review_required

確定できない事項は必ず次を記録する:

- `what_ja`: 何を確認するか
- `why_ja`: なぜ確定できないか
- `where_ja`: 保存資料のパスとページ内の場所、または公式URL
- `source_refs`: 根拠資料ID

`human_review_required` が1件でもあれば `data_quality.status` は
`needs_review` または `failed` とする。

## 完了報告

次を簡潔に報告する:

- 更新ファイル、対象スキー場・シーズン
- 使用した公式URLと追加取得URL
- 保存資料数、PDF数、画像内から読んだ料金
- audience / calendar / operating hours / product / channel / offer /
  party rule / fee の件数
- 機械検証、独立監査、シナリオテストの結果
- 判読不能、unknown、未解決事項、human_review_required
- `data_quality.status`

## Skill自体の検証

Schema・taxonomy・検証ロジックを変更した場合:

```bash
node .shared/skills/collect-ski-lift-ticket-pricing/tests/run-tests.mjs
```

取得処理も変更した場合だけ `--with-capture` を付ける。
