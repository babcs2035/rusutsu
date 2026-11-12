---
name: repair-ski-lift-ticket-data
description: 収集済みのリフト券JSON（src/private/data/lift-ticket/）を点検し、画面の機能に要るのに欠けている情報、後から加わった収集の決まりが反映されていない箇所、出典リンクが別の料金を指している誤りを見つけて、公式資料から直す。「既存データの不足を直して」「前の変更が反映されていないスキー場を直して」「出典の場所が違うのを直して」「全スキー場を点検して」のような依頼で使う。新規収集・シーズン更新は collect-ski-lift-ticket-pricing を使う。
---

# リフト券データの点検・修正

収集済みのリフト券JSONを点検し、欠けている情報や誤りを公式資料から直す。
集め方・書き方・検証の決まりはすべて `collect-ski-lift-ticket-pricing` が正本で、
このスキルは「何が欠けているかを見つけ、直す順番と範囲を決める」ことだけを持つ。

## 正本と参照先

このSkillの正本は `.shared/skills/repair-ski-lift-ticket-data/`。
`.agents/skills/` と `.claude/skills/` はシンボリックリンクなので編集しない。

| 必要なとき | 読むもの |
| --- | --- |
| 点検項目の意味と直し方 | `references/gap-checks.md` |
| 直すときの集め方・書き方 | `.shared/skills/collect-ski-lift-ticket-pricing/SKILL.md` と、その references（data-model・extraction-rules） |
| 複数件・全件・途中再開 | 収集スキルの `references/batch-workflow.md`（進捗は同じ `lift-ticket-workflow/{run-id}/run.json` に保存） |
| 点検 | `scripts/find-lift-ticket-gaps.mjs` |

## モデルと分担

プロジェクトの `AGENTS.md` のコスト方針に従う（Claude Code では `sonnet`）。

| 作業 | 担当 | 成果物 |
| --- | --- | --- |
| 点検の実行・優先度の振り分け | 親（スクリプト） | 対象スキー場と項目の一覧 |
| 1スキー場の不足を公式資料で埋める | サブエージェント / medium（単純な欄の追加は low） | 草案JSONの差分、根拠URL、埋められなかった項目と理由 |
| 直した箇所の独立監査 | 埋めた担当とは別のサブエージェント / medium | 直した値と原典の照合結果 |
| 出典リンクの付け直し・検証、機械検証、料金照会 | 親（既存スクリプト） | 検証結果 |
| 判断が要る事項・本番反映 | 親 | 判断と反映結果 |

同時に動かすのは最大2体。点検・出典リンクの検証のように結果が決まっている作業はスクリプトで行い、
エージェントに任せない。

## 手順

1. **点検する。** 作業領域へ結果を保存する:

   ```bash
   node .shared/skills/repair-ski-lift-ticket-data/scripts/find-lift-ticket-gaps.mjs \
     --summary --json src/private/data/resorts-temporary/tmp/lift-ticket-gaps/gaps.json
   ```

   指定スキー場だけなら、IDを引数に並べる。依頼が特定の項目だけ（「出典の場所」等）なら、
   その項目だけを対象にする。

   出典リンクが別の料金を指していないかは点検スクリプトでは分からないので、
   全スキー場に `verify-quotes.mjs` を流して確かめる（優先度A）:

   ```bash
   node src/private/scripts/lift-ticket-quotes/verify-quotes.mjs
   ```

2. **順番を決める。** `references/gap-checks.md` の優先度A → B → C の順に直す。
   優先度A（出典が別の料金を指している恐れ）は全スキー場を先に片付ける。
   複数件なら run.json に対象・項目・進捗を保存し、バッチごとに再承認を求めず続ける。

3. **1スキー場ずつ直す。** 収集スキルの Stage 1 の1（本番の現在の内容を読み、
   ローカルとの差分を確かめてから草案を作る）から始める。
   - 直すのは点検で出た項目と、その項目を埋めるのに要る箇所だけ。点検に出ていない
     料金・条件を、ついでに書き換えない（気づいた誤りは別項目として報告する）。
   - 埋める情報は登録済みの公式URLから取る。足りなければ収集スキルの Stage 0 で
     公式URLを確かめて登録してから取る。検索結果の要約を根拠にしない。
   - 公式に無いことは作らない。`notes_ja`・`data_quality`・MISSING.md に残す。
   - 料金・券種・区分・出典URLを変えた料金は、`source_quotes` を付け直す。
   - メインのリンク（`main-links-missing`）は、`references/gap-checks.md` の
     「メインのリンクの決め方」に従う。あわせて、券ごとの商品ページを offer の
     `purchase_url` に書き（`web-offer-product-page-not-linked`）、レンタルの購入ページが
     あればそのWeb料金を集める（`rental-web-price-not-collected`）。

4. **出典リンクを直す（優先度Aと `price-without-quote`・`file-source-without-page`）。**
   収集スキルの Stage 1 の9のスクリプト3本を、そのスキー場の草案に流す。
   合格の基準は収集スキルの data-model「source_quotes」のとおりで、
   **強調された箇所の行見出し・列見出し・見出しが、その料金の券種・区分・割引と合うことを
   全件で確かめる。** 合わない引用は外す。手で引用を書かない。

5. **検証する。** 収集スキルの機械検証3本と点検スクリプト（`--file <draft.json>`）を流し、
   直した項目が消えたことを確かめる。料金を足した・変えたスキー場は、収集スキルの
   「最終統合と照会テスト」の料金照会を、直した料金について行う。期待値は公式ページから
   独立に書く（監査担当が書く）。

6. **反映する。** 本番反映まで依頼されていれば、収集スキルの「本番DBへの反映」に従う
   （プレビューで差分が直した箇所だけであることを確かめてから `--apply`）。
   反映したら、MISSING.md のそのスキー場の行を書き直し、作業領域を消す。

## 完了報告

チャットで、1項目1文の箇条書きで報告する。

- 点検した件数と、項目ごとの不足件数（直す前 → 直した後）
- 直したスキー場と、直した項目
- 出典リンクを外した件数と、その理由（別の区分・別の割引を指していた等）
- メインのリンクを入れたスキー場の件数と、1つの欄に候補が2つ以上あったスキー場
  （スキー場ごとに「欄・入れたURL・載せなかったURL」を1件1文で、URLを添えて並べる）
- Webのレンタル料金を足したスキー場と、足した件数
- 公式に無く埋められなかった項目（MISSING.md に書いた行）。判断が要る事項は、各行に対応する公式URLを添える
- 機械検証・独立監査・料金照会の結果、本番反映の結果
- 点検スクリプトで見つけられない種類の誤りに気づいたら、その内容（`references/gap-checks.md` と点検スクリプトに項目を足す）
