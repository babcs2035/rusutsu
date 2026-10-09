---
name: collect-ski-lift-ticket-pricing
description: スキー場の公式URLを調査・確認して登録し、リフト券料金と適用条件を収集・独立監査して1スキー場×1シーズン×1JSONへ整理する。URL指定あり・なしの収集、公式料金URLの調査、lift-ticket JSONの更新・監査、全スキー場の小分け処理・再開、日付・人物区分からの料金照会に使う。シーズン券・保有者特典、交通・宿泊付きパックは対象外。URLはsrc/private/data/lift-ticket-source/、確定版はsrc/private/data/lift-ticket/、進捗はsrc/private/data/lift-ticket-workflow/で管理する。
---

# リフト券料金の収集・監査

ユーザー指定または自分で探索・確認した公式情報を登録し、リフト券料金を
共通JSONへ整理する。URL探索、取得＋抽出、独立監査を分け、推測しない。

## 依頼の範囲と実行モード

- **URL調査のみ**: Stage 0まで。料金JSON作成・本番反映は行わない。
- **料金収集・更新**: Stage 0から照会テストまで進め、本番反映は依頼の範囲に従う。
  「試す」「草案まで」「反映しない」の依頼では本番へ書き込まない。
  試行・草案のみでは既存確定版も更新せず、結果を作業領域に保持する。
- **監査のみ・料金照会**: 既存の登録URL・保存資料・JSONを使う。
  URL探索やデータ更新は、その作業も依頼されている場合に行う。
- **複数件・全スキー場・途中再開**: [複数件の進め方](references/batch-workflow.md)
  を先に読み、対象と進捗を保存して小分けで進める。全件依頼はバッチごとに
  再承認を求めず続行するが、個別の未解決事項は保留する。

URLが指定されている場合はその範囲を尊重し、探索も依頼されていなければ検索で
広げない。URLなしの収集依頼ではStage 0で自分で探す。対象シーズンが未指定なら
現在日付から想定するシーズンを明示するが、資料のシーズンは内容から別途確認する。
名称が曖昧ならマスタの所在地・旧称で照合し、対象IDを推測で決めない。

## 正本と参照先

このSkillの正本は `.shared/skills/collect-ski-lift-ticket-pricing/`。
`.agents/skills/` と `.claude/skills/` はシンボリックリンクなので編集しない。

| 必要なとき | 読むもの |
| --- | --- |
| URL探索・登録・登録URLの再確認 | `references/source-discovery.md`、`templates/source-urls.template.json` |
| 複数件・全件・再開 | `references/batch-workflow.md`、`templates/batch-run.template.json` |
| 抽出・データ編集 | `references/data-model.md`、`references/extraction-rules.md`、`references/taxonomy.json`、`templates/lift-ticket.template.json` |
| 書き方に迷ったとき | `references/examples.md` |
| 独立監査 | `references/extraction-rules.md` の監査チェックリスト、`references/taxonomy.json` |
| 構造検証 | `scripts/validate-lift-ticket.mjs`（モデルはSchemaを直接読まない） |

主要パス:

```text
# 残すもの（Git管理）
src/private/data/lift-ticket-source/{resort-id}.json        公式URLの登録
src/private/data/lift-ticket/{resort-id}/{season-id}.json   確定版（本番DBのバックアップ）
src/private/data/lift-ticket/MISSING.md                     全スキー場の不足情報の一覧
src/private/data/lift-ticket-workflow/{run-id}/run.json     対象・段階別進捗・保留理由

# 作業中だけ使うもの（Git管理外。本番DBへ反映したら削除する）
src/private/data/resorts-temporary/tmp/lift-ticket/{resort-id}/
  sources/{season-id}/        公式ページの保存資料
  {season-id}.draft.json      草案
  {season-id}.audit.json      独立監査の結果

src/private/data/resorts-temporary/tmp/lift-ticket-discovery/{resort-id}/
  {season-id}/                URL候補・探索時の確認資料（料金抽出の根拠にはしない）
```

公開サイトと管理画面 `/admin/ticket` が読むのは、本番DBの `lift_ticket_seasons`
テーブル（1スキー場 × 1シーズン = 1行）である。確定版JSONは
「本番DBへの反映」の手順で保存し、同じ内容をローカルにも残す。

保存資料・草案・監査結果は、抽出と監査で数値の誤りを確かめるための作業資料で、
反映後は使わない。利用者が料金を確かめる根拠は、確定版の `sources[].url`
（画面の出典リンク）である。

## 対象範囲

想定する利用者は、自分でスキー場へ行き、ゲレンデの窓口やスキー場のWeb販売で
リフト券を買う人である。

収集する:

- 日券、時間券、回数券、ナイター券、複数日券、共通券、滑走用セット券
- 通常料金、無料料金、Web・前売・会員・宿泊者・障がい者等の条件付き料金
- 利用期間、販売期間、購入期限、購入経路、対象者、必要証明、必須手数料
- 営業時間、ナイター営業日、定休日

収集しない:

- シーズン券と、その購入者・保有者だけの特典
- 観光用ゴンドラ券など滑走を目的としない券
- バスツアー、交通付きパック、宿泊込みプランなど、リフト券と交通・宿泊を
  まとめた商品（スキー場の公式サイトで売っていても含めない。バスツアーは別途収集する）
- 駐車料金、キャンセル料、再発行手数料など通常購入額でない費用
- 返金されるICカード保証金

## 絶対ルール

1. 公式資料にない金額・年齢・学校区分・日付・条件を推測しない。
2. 1スキー場×1シーズン×1JSONとし、別シーズンを混ぜない。
3. URL探索はStage 0だけで行い、実際に開いて確認した公式URLだけを登録する。
   抽出の情報源は登録URL、そこから直接辿れる公式資料、ユーザーが明示した
   追加URLだけ。外部販売ページは公式からの直接案内を確認する。
   抽出中に不足が見つかったら、依頼で許可された範囲内でStage 0へ戻って
   確認・登録してから再取得する。指定URL限定なら範囲外は不足として残す。
   検索結果のスニペットや探索時の要約を料金の根拠にしない。
4. 確定情報には保存資料を指す `source_refs` を付ける。
5. 分類ラベルは `references/taxonomy.json` だけを正本とし、独断で追加しない。
6. 不明点は `unknown`、`unresolved_questions`、または
   `human_review_required` に理由と確認場所を残す。
7. 保存資料はフォーマッタで変更しない。JSON修正は該当箇所だけ差分編集する。

## 人物区分と料金表示の必須挙動

詳細は `references/data-model.md` の `audiences` / `offers` を正本とする。

- 小学生・中学生・高校生は通常、年齢ではなく在籍する学校区分で料金が決まる。
  公式が学校区分を指定している場合は `school_levels` を必ず記録し、年齢だけへ
  置き換えない。UIで学校を選び年齢を空欄にしても、公式の該当料金を引けることを確認する。
- 未就学児は年齢で無料・有料が分かれることがあり、シニアは年齢制が多い。
  公式の境界年齢を記録し、境界の直前・当日で照合する。
  「4歳以上かつ小学生以下」は年齢下限と学校区分の両方を記録する。
- これらは抽出時の着眼点であり、公式条件の代わりではない。公式が年齢制なら
  年齢制のまま残し、学校から典型年齢を推測しない。年齢未入力で確定しない場合は
  年齢入力を求めることをテストする。未掲載料金を作って全区分を埋めない。

- どの人物条件にも当てはまらない基準区分を `is_default: true` で1件置く
  （通常は大人）。
- 公式に対象者区分が書かれていないofferは `audience_ids` を空にせず、
  基準区分へ紐付ける。
- 障がい者も学校区分と年齢を別に確認する。UIの障がい者欄の追加区分（`baseCategory`）で
  小学生・中学生等を選び、成人だけでなく障がい児の専用料金・通常料金への戻しも照合する。
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
- 早割・WEB前売（`advance_purchase` / `online_purchase` のみで対象者の絞り込みがないもの）は、
  照会日の時点で `sales_period` 内かつ `purchase_deadline` に間に合い、通常料金より
  安ければ計算結果に使う。販売期間を過ぎたら料金表にも計算にも出さないので、
  `sales_period` は公式の販売期間どおりに必ず記録する。
- `special_day` のうち、calendar・audienceだけで対象が確定し、追加資格・提示物・
  事前購入条件がない料金は自動適用する（例: 土曜日の小学生向けこどもデー）。

## Stage 0: 公式URLの探索・確認・登録

[URL探索の手順](references/source-discovery.md)を読む。
マスタの公式サイトと既存のURL登録を起点に、必要な項目のページを探索し、
本文・PDF・画像・販売内容を開いて確認する。公式性、対象施設、内容、
資料のシーズンの確認状況を記録し、公式性と必要な内容を確認できたURLだけ登録する。

URL登録はシーズンに紐付けず、1スキー場1ファイルで管理する。
確認した内容と由来は登録ファイル、未発見・閲覧不能・今季未発表は探索結果に残す。
登録済みという理由だけで今シーズンの資料と扱わない。
URL調査のみの依頼はここで報告して終了する。

## Stage 1: 取得＋抽出

サブエージェントが利用可能なら、取得＋抽出担当と監査担当を分ける。
抽出担当に監査を兼任させない。

1. 入力を確認する:
   - 既存マスタと一致するスキー場ID
   - スキー場名
   - 対象シーズン
   - Stage 0で確認した、またはユーザー指定の公式URL一覧
   - 新規作成 / 更新 / 監査のみ
   更新・監査では本番の現在の内容を読み、管理画面の修正を取り込んで始める。
   `--pull` はローカル確定版を上書きするため、先に対象ファイルのGit差分・
   未追跡状態・他runの使用を確認し、元ファイルとSHA-256を作業領域へ保存する。
   未反映候補・他者編集がある場合、試行・監査のみの場合はpullを実行しない。
   `scripts/publishLiftTicket.ts` の `fetchRemote` と同じ読取APIで本番データを
   作業領域へ保存し、ローカルとの差分を確認する。競合を解消できなければ保留する。
   ローカルを同期してよい場合だけpullし、`git diff` と本番未登録の有無を確認する:

   ```bash
   mise run lift-ticket:publish -- --resort <resort-id> --season <season-id> --pull
   ```

   抽出・修正は本番の現在の内容を基に作業領域の `{season-id}.draft.json` で行う。
   同期済み確定版または読取APIで保存した本番データを複製し、本番versionと
   ローカルの開始時SHA-256を残す。本番未登録の場合はローカル候補と区別する。

2. `src/private/data/lift-ticket-source/{resort-id}.json` の対象URLを確認する。
   未登録の追加URLはStage 0の基準で確認・登録する。
   自動探索の由来は登録ファイルの `discovered_by` 等に残す。
   既存の `sources[].user_specified` は「登録URLか」を表す互換フィールドであり、
   自動探索した登録URLでもtrueとする（人が指定したという意味に変更しない）。
3. 今回取得するURL集合を、指定範囲・Stage 0の結果・対象シーズンから確定する。
   登録に残した旧資料・閲覧不能URL・依頼範囲外のURLを一律に取得しない。
   全登録が今回の取得対象HTMLと一致するときだけ次を使う:

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/capture-sources.mjs \
     --resort <resort-id> --season <season-id> --from-registry
   ```

   一部URLだけを使う場合やPDF・画像がある場合は `--from-registry` を使わず、
   HTMLは `--url`、ファイルは `--download` に今回のURLを明示する。
   「指定URLだけ」なら `--follow-links` も使わない。既存manifestが今回の範囲外の
   資料を含む場合は、元資料を退避して別の作業領域を `--out` で指定し、
   範囲外の資料がseason_checkや抽出へ混ざらないようにする。

4. `manifest.json` と各 `metadata.json` で取得成功・公式ドメイン・保存先を確認する。
5. 保存資料を次の順で読む:
   - `visible-text.txt`
   - `tables.md`（表の金額はここで確定）
   - `screens/*.jpg` の全タイル（画像内料金・脚注を確認）
   - 必要なPDF・料金画像
6. 必要な公式リンク先は `--url` / `--download` と `--linked-from` で追加取得する。
   別ドメインの販売ページはStage 0で公式からの直接案内と商品内容を確認する。
   登録一覧に含めたPDF・画像は `--download` で取得する（登録一覧からの取得は
   ページ取得なので、ファイル本体の保存・可読性も確認する）。
7. `manifest.json.season_check.verdict` が `match` でなければその施設の抽出を止める。
   人間が公式資料から確定した場合だけ `--accept-season` を使う。
   matchでも各料金表・販売商品・脚注のシーズンを個別に照合する。
   古い料金表と今季の営業日を組み合わせて今季料金を作らない。
8. 新規作成ではテンプレートから作業領域の `{season-id}.draft.json` を作り、
   資料にある情報だけを記録する。
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
- 動的価格、保証金、手数料、共通券、セット内容、追加券（`add_on_to_product_ids`）
- シーズン券や保有者限定特典の混入

監査結果を作業領域の `{season-id}.audit.json` に保存する:

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
   修正後は独立担当が修正箇所と影響範囲を再確認し、最新草案のSHA-256と
   照合した監査結果へ更新する。古い草案への監査を流用しない。
2. 機械検証3本を再実行し、通過した草案を候補として保持する。
   照会テスト前に既存確定版を上書きしない。
3. [UI共通照合テスト](references/ui-contract-tests.md)を全スキー場で実施する。
   UIにある全人物区分について年齢未入力・必要な境界年齢を確認し、券種、利用時間、
   平休日・年末年始・季節料金、定休日と例外営業日、営業期間内外を同じ項目で確認する。
   期待額・条件は公式URLの表と脚注から独立に転記する。実装の計算結果や草案JSONの
   値をそのまま期待値にしてはならない。画面と同じ公開データ変換と料金計算を通す。
   `lookup-price.mjs --audience <id>` だけではUIの学校区分の不具合を検出できない。
   草案を参照資料どおり一時ルートの `{resort-id}/{season-id}.json` へ複製して
   `LIFT_TICKET_DATA_ROOT` をそのルートへ向ける。旧確定版のテストを草案の成功と
   扱わない。テスト結果に対象草案のSHA-256を残す。

4. 答えられない事項は、資料にあれば抽出漏れとして修正し、資料になければ
   `unresolved_questions` へ記録する。
   ただし**料金計算が変わる事項**（1日券でナイターも滑れるか等）は、
   反映前に利用者へチャットで1行ずつ尋ね、回答を `notes_ja` に
   「管理者の確認（日付）」として残す。
5. スキー場専用のテスト関数を増やさず、共通テストの期待値表へ公式照合ケースを追加する。
   追加券・複数日券・親子パック等は該当データがある場合に同じ機能別テストを適用する。
   実データの照合とCIの固定資料テストの両方を通す。CIから未コミットの
   `src/private` JSONを直接参照させない。
6. 独立監査と照会テストを通過した候補は草案と結果を作業領域に保持する。
   途中で草案を修正した場合は機械検証・独立再確認・照会テストをやり直す。
   料金計算を左右する未解決事項に回答がなければ、その施設は反映を保留する。
   試行・草案まで・本番未反映の依頼はここで終了し、既存確定版を保持する。
   確定版JSONだけの作成・更新を明示された場合は、検証済み候補を指定先へ保存し、
   本番未反映であることを報告する（保存先が既存ファイルなら元内容を退避する）。

## 本番DBへの反映

本番反映まで依頼され、照会テストまで終えた候補だけを本番DBへ保存する。
接続先とトークンは `.env.local` の `DATA_API_BASE_URL` と
`INTERNAL_DATA_API_ADMIN_TOKEN` を使う。

プレビュー前に開始時のローカルSHA-256と現在のファイルを照合する。途中で
他者編集があれば上書きせず保留する。現行publishは確定版パスを読むため、
元ファイル（存在しなかった場合も記録）を作業領域へ退避したうえで、検証済み候補を
`src/private/data/lift-ticket/{resort-id}/{season-id}.json` へ配置する。
試行・本番未反映の依頼ではこの配置を行わない。

1. プレビューする（本番へは書き込まない）:

   ```bash
   mise run lift-ticket:publish -- --resort <resort-id> --season <season-id>
   ```

   管理画面と同じ検証3本を実行し、エラーがなければ本番の現在の内容との差分を
   表示して、`src/private/data/resorts-temporary/tmp/lift-ticket-publish/` に
   プランを保存する。「本番と同じ内容です」なら反映は不要。
2. 差分が今回の作業で変えた箇所だけであることを確認する。自分が変えていない
   差分（管理画面での修正など）が出たら、候補を草案として保持し、開始時の
   元ファイルを戻してからStage 1の競合確認・本番読取りをやり直す。
3. 同じコマンドに `--apply` を付けて保存する。プレビュー後にローカルJSONか
   本番が変わっていれば拒否されるので、プレビューからやり直す。

反映せず保留・失敗した場合、確定版パスが配置した候補のSHA-256のままである
ことを確かめて元内容へ戻す。元ファイルがなかった場合は今回作った候補だけを
取り除く。配置後に他者編集があれば復元で上書きせず保留する。
API応答が途切れて反映成否が不明なら、先に本番を読み取って確認する。
反映成功または本番同内容を確認できた場合は候補を確定版として残す。

`data_quality.status` が `needs_review` のJSONも反映できる。公開画面は
その状態を表示するので、未解決事項は完了報告で伝える。

反映できたら（または「本番と同じ内容です」と表示されたら）、作業領域を削除する:

```bash
rm -rf src/private/data/resorts-temporary/tmp/lift-ticket/<resort-id>
```

確定版JSONと公式URLの登録ファイルはコミット対象として残す。

反映したら `lift-ticket/MISSING.md` の、そのスキー場の行を書き直す。
利用者が困る不足（営業時間不明、前シーズンの情報が残っている、共通券の相手が未登録など）
を1項目1文で、`- 八方尾根 営業時間不明` のように「スキー場名 不足内容」だけ書く。
理由や資料の場所は書かない（詳細はJSONの `data_quality` にある）。
ただし、不足情報を確認できる公式URLがあれば、行末に括弧でURLだけ添える
（`- 明宝 Web販売の券種・価格が未収集（https://www.meihoski.co.jp/webticket/）`）。
日付や補足は付けない。解消した行は消す。

## human_review_required

確定できない事項は必ず次を記録する:

- `what_ja`: 何を確認するか
- `why_ja`: なぜ確定できないか
- `where_ja`: 保存資料のパスとページ内の場所、または公式URL
- `source_refs`: 根拠資料ID

`human_review_required` が1件でもあれば `data_quality.status` は
`needs_review` または `failed` とする。

## 完了報告

チャットで、**1項目1文の箇条書き**で報告する。URL調査のみでは施設・シーズン、
採用URLと確認内容、未発見・閲覧不能・旧シーズンの項目を報告する。
複数件では進捗台帳、URL確認・テスト・反映の各件数、保留施設と理由を報告する。
未実施の段階を成功と報告しない。詳しいことは
利用者が聞き直す。未解決事項・human_review_required は「JSONに記録した」で
済ませず、確認してほしい内容を1件1文でチャットに並べる（利用者はJSONを開かない）。

報告する項目:

- 更新ファイル、対象スキー場・シーズン
- 使用した公式URLと追加取得URL
- 保存資料数、PDF数、画像内から読んだ料金
- audience / calendar / operating hours / product / channel / offer /
  party rule / fee の件数
- 機械検証、独立監査、シナリオテストの結果
- 判読不能、unknown、未解決事項、human_review_required
- `data_quality.status`
- 本番DBへの反映結果（新規作成 / 更新 / 変更なし、反映しなかった場合はその理由）
- `lift-ticket/MISSING.md` に書いた行

## Skill自体の検証

Schema・taxonomy・検証ロジックを変更した場合:

```bash
node .shared/skills/collect-ski-lift-ticket-pricing/tests/run-tests.mjs
```

取得処理も変更した場合だけ `--with-capture` を付ける。
