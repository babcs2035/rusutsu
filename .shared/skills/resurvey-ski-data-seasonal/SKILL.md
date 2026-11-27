---
name: resurvey-ski-data-seasonal
description: シーズン前に年1回行う、全スキー場のデータの大きな再調査。全スキー場の公式サイトを見て回って、営業情報・リフト券料金・レンタル料金・ゲレンデマップのページを探し直し（登録済みのURLが古くなっていないか、新しいページができていないか）、その結果をもとに、営業情報クローラーの取得先の見直しと新規作成、今季のリフト券・レンタル料金の収集と料金計算できる形への整理、ゲレンデマップの今季版への差し替え、公式リンクの集め直し、雪マジ・ツアー・パスの更新、動画を含むリンク切れの解消までを、台帳で進み具合を管理しながら数日かけて進める。「シーズン前の再調査をして」「全スキー場を調べ直して」「今季のデータに総入れ替えして」「新しいページができていないか全部見て」「年に1回の大きなメンテナンスをして」「再調査の続きをして」のような依頼で使う。シーズン中に変化だけを拾う軽い点検は maintain-ski-data-weekly を使う。
---

# シーズン前の再調査

週次の見回りは「登録済みのページが変わったか」しか見ない。古いページばかり見ているあいだに、公式サイトの別の場所へ
新しい営業情報や料金のページができていても気づけない。年に1回、**登録済みのURLを疑って、公式サイトをゼロから見て回る**。

全スキー場（約450）×複数の種類なので、1回の会話では終わらない。台帳に進み具合を残し、何度でも続きから再開する。

## 正本と参照先

このSkillの正本は `.shared/skills/resurvey-ski-data-seasonal/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| 台帳・材料づくり・監査・振り分け | `scripts/seasonal.mjs`（`init` / `status` / `next` / `prepare` / `audit-survey` / `plan` / `mark`） |
| 公式サイトの見て回りの依頼文と結果の形 | `references/survey-brief.md` |
| 段階ごとの進め方と完了の条件 | `references/stages.md` |
| 各段階の作業そのもの | 下の表の担当スキルの `SKILL.md` |

データ:
- 台帳: `src/private/data/maintenance/seasonal/<season>/run.json`（Git管理）。
- 見て回りの結果: `src/private/data/maintenance/seasonal/<season>/survey/<resortId>.json`（Git管理）。
- 作業領域: `src/private/data/resorts-temporary/tmp/maintenance/<season>-seasonal/`（Git管理外）。

## 段階

| 段階 | すること | 単位 | 担当スキル |
| --- | --- | --- | --- |
| `baseline` | 週次の見回りを1回流し、今の指摘と、未登録のページの手がかり（`leads.json`）を得る | 1回 | `maintain-ski-data-weekly` |
| `survey` | 公式サイトを見て回り、営業情報・お知らせ一覧・料金・レンタル・マップのページを探し直す | スキー場（3件ずつ） | このSkill |
| `crawler` | 取得先が変わった・営業情報のページが新しくできたスキー場の、クローラーを直す・作る | スキー場 | `build-ski-resort-latest-crawler` |
| `tickets` | 今季のリフト券・レンタル料金を集め、料金照会まで通して計算できる形にする | スキー場 | `collect-ski-lift-ticket-pricing` |
| `maps` | マップのページ・図が変わったスキー場を、今季の図へ差し替える | スキー場 | `maintain-ski-trail-maps` |
| `links` | 公式リンクを全スキー場で集め直す | スキー場（3件ずつ） | `collect-ski-resort-official-links` |
| `yukimaji` | 雪マジの掲載を料金データへ反映する | 1回 | `maintain-ski-yukimaji` |
| `listings` | ツアー・パスの掲載を取り直し、やめるサイトを決める | 1回 | `maintain-ski-external-listings` |
| `link-health` | 動画を含むリンク切れを直す | 1回 | `check-ski-resort-link-health` |
| `wrapup` | 点検し直して、指紋の基準を取り直す | 1回 | `maintain-ski-data-weekly` |

`survey` を先に済ませる。公式サイトの移転が分かるのはここで、後の段階はどれも公式サイトを起点にするため。
`crawler`・`tickets`・`maps` は、`survey` の結果から要るスキー場だけを選ぶ（`plan`）。`links` は全スキー場。

見ないもの: スキー場の基本情報（営業期間・閉鎖・名称変更）、天気・積雪・アメダス、レビュー、EV充電。
見て回りの途中で閉鎖・休止・名称変更に気づいたら、直さずに報告へ書く。

## 手順

1. **台帳を用意する。** 初めてなら作り、続きなら進み具合を見る。

   ```bash
   node .claude/skills/resurvey-ski-data-seasonal/scripts/seasonal.mjs init      # 既にあれば、増えたスキー場だけ足す
   node .claude/skills/resurvey-ski-data-seasonal/scripts/seasonal.mjs status
   ```

   シーズンは今の日付から決まる（7月以降はその年に始まるシーズン）。別のシーズンは `--season 2027-2028`。

2. **`status` の表で、上の段階から順に「これから」が残っている段階を進める。** 段階ごとの進め方は `references/stages.md`。
   どの段階も同じ回し方をする。

   ```bash
   node …/seasonal.mjs next --stage <段階>                      # 次に手を付けるスキー場（理由のメモつき）
   # …担当スキルの手順で作業する…
   node …/seasonal.mjs mark --stage <段階> --ids a,b --status done
   node …/seasonal.mjs mark --stage <段階> --ids c --status hold --note "保留の理由"
   ```

   - `done`: その段階の完了の条件（`references/stages.md`）を満たした。
   - `hold`: 今は進められない（今季料金が未発表、サイトが落ちている、ユーザーの判断待ち）。理由を必ず書く。
   - `skip`: そのスキー場には要らない（公式に掲載が無い、変化が無い）。

3. **`survey` は材料づくり → 見て回り → 監査 → 振り分けの順。**

   ```bash
   node …/seasonal.mjs prepare --ids a,b,c --leads <baselineの作業領域>/pages/leads.json
   # references/survey-brief.md の依頼文で担当へ渡す（結果は survey/<id>.json）
   node …/seasonal.mjs audit-survey --ids a,b,c     # 形と、報告されたページが開けることを確かめる。通れば survey が done になる
   node …/seasonal.mjs plan                          # 済んだ結果から crawler・tickets・maps の要・不要を決める
   ```

   `plan` は何度流してもよい。手で決めた段階・済んだ段階は上書きしない。

4. **止めずに続ける。** 複数日にまたがる作業なので、バッチごとに承認を求めない。止まるのは、
   その段階の「これから」が無くなった・全スキー場に共通の障害が出た・ユーザーの判断が要る、のどれかだけ。
   途中の報告は担当を動かしたまま書き、手番を終える前に次のバッチを渡しておく。
   会話が切れても、次回 `status` を見れば続きから再開できる。

5. **終わりに `wrapup`。** `references/stages.md` の `wrapup` のとおり、点検し直して基準を取り直し、`status` の表を報告に載せる。

## モデルと分担

プロジェクトの `AGENTS.md` のコスト方針に従う（Claude Code では `sonnet`）。

| 作業 | 担当 | 成果物 |
| --- | --- | --- |
| 台帳・材料づくり・監査・振り分け | 親（`seasonal.mjs`） | 台帳、`brief/<id>.json` |
| 1バッチ（3スキー場）の見て回り | サブエージェント sonnet / medium（小さなサイトだけのバッチは low） | `survey/<id>.json` |
| 見て回りの抜き取り確認（1バッチにつき1スキー場、`changed`・`new` のページを親が開く） | 親 | 採否 |
| 各段階の作業 | 担当スキルの分担表のとおり | 担当スキルの成果物 |
| 保留・不要の判断、本番への反映 | 親 | 台帳の記録、反映結果 |

同時に動かすのは全体で最大2体。見て回りは別々のスキー場なので2体を並べてよい。
本番への反映は各担当スキルの決まり（差分を確かめてから `--apply`）に従う。再調査の依頼は更新までを含むので、
ユーザーが「調べるだけ」と言っていなければ反映まで進める。

## 完了報告

チャットで、1項目1文の箇条書きで書く。途中の報告でも同じ形にする。
- `status` の表（段階ごとの、これから・済み・保留・不要の件数）。
- 見て回りで分かったこと: 公式サイトが移転・消失したスキー場、営業情報・料金・レンタル・マップのページが新しくできた・変わったスキー場の件数と主なもの（各行にURL）。
- 段階ごとの成果: 直した・作ったクローラー、集めた料金（今季料金に更新できた件数、レンタルを足した件数）、差し替えたマップ、集め直した公式リンク。
- 保留の内訳（今季料金が未発表の件数は、週次の見回りが拾うことを添える）。
- 閉鎖・休止・名称変更が疑われるスキー場（各行にURL）。
- ユーザーに決めてほしいこと（各行にURL）。`src/private` の更新が未コミットであること。
