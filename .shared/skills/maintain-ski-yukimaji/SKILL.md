---
name: maintain-ski-yukimaji
description: 雪マジ（マジ☆部の19〜22歳向けリフト券無料・割引クーポン）の全施設の掲載と、リフト券JSONの `yukimaji` 欄を突き合わせ、掲載文が変わった施設・記入漏れ・名寄せ漏れ・掲載終了を見つけて、料金計算に使える形（無料クーポン・割引クーポン別の対象券・期間・曜日・回数・割引後の金額）へ更新し、本番DBへ反映する。「雪マジを全スキー場で更新して」「雪マジの料金を計算に使える形にして」「雪マジの掲載が変わっていないか調べて」「雪マジ対応のスキー場を揃えて」のような依頼で使う。リフト券JSONが無い施設の新規収集は collect-ski-lift-ticket-pricing に回す。
---

# 雪マジの点検・更新

雪マジの掲載を、料金計算が読むリフト券JSONの `yukimaji` 欄へ正しく写した状態に保つ。
掲載は毎日3時に本番の `yuki_magi` へ取り込まれる（掲載文だけ）。計算に使う構造化した内容は
リフト券JSON（本番の lift-ticket ドキュメント）が持つ。このSkillは両者の差を見つけて埋める。

## 正本と参照先

このSkillの正本は `.shared/skills/maintain-ski-yukimaji/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| `yukimaji` 欄の書き方（無料・割引・price_rules・fees・requirements） | `.shared/skills/collect-ski-lift-ticket-pricing/references/data-model.md` の「## yukimaji（雪マジ）」 |
| 詳細ページの読み方 | 同 `SKILL.md` の「Stage 1b: 雪マジの取得」 |
| 画面・計算の仕様（Y1〜Y15） | `docs/plans/lift-ticket-duration-test-cases.md` の「YM」 |
| 担当への依頼文 | `references/agent-brief.md` |
| 点検 | `scripts/yukimaji.mjs check` |

データ:
- 掲載（読むだけ）: 本番 `/api/internal/v1/yuki-magi`（`.env.local` の `DATA_API_BASE_URL` と管理トークン）。
- 施設番号とスキー場IDの対応: `src/private/data/yukimaji/facility-map.json`（Git管理）。
  jalan.net 詳細URLの `CLYUKI…` が鍵。志賀高原のように1施設が複数スキー場にまたがる場合は全IDを並べる。
- 更新先: `src/private/data/lift-ticket/<resort-id>/<season>.json` の `yukimaji`。本番へは `mise run lift-ticket:publish` で反映する。
- 作業領域: `src/private/data/resorts-temporary/tmp/yukimaji/<run-id>/`（Git管理外。反映後に削除する）。

## モデルと分担

プロジェクトの `AGENTS.md` のコスト方針に従う（Claude Code では `sonnet`）。

| 作業 | 担当 | 成果物 |
| --- | --- | --- |
| 全施設の点検・仕事の切り分け | 親（`check`） | report.json、summary.md |
| 掲載文が変わった施設の `yukimaji` 更新（最大10施設を1回で） | サブエージェント sonnet / low | `drafts/<id>.json` |
| 差分の監査（掲載文・詳細ページと照らす） | 親 | 採否 |
| 本番反映・再点検 | 親 | 反映結果、再点検で `current` |
| リフト券JSONの無い施設 | collect-ski-lift-ticket-pricing の手順（今季料金の発表確認から） | 確定版JSON |

同時に動かすのは最大2体。

## 手順

1. **点検する。**

   ```bash
   node .claude/skills/maintain-ski-yukimaji/scripts/yukimaji.mjs check \
     --run src/private/data/resorts-temporary/tmp/yukimaji/<run-id>
   ```

   `summary.md` に状態ごとの件数と、変わった掲載文の前後が出る。空白と、全施設に付く定型の注意書き
   （「※営業期間は変更になる可能性があります。」「最新の営業状況を…ご確認ください。」）の違いは変更と見なさない。

2. **状態ごとに片付ける。**
   - `text_changed`: 掲載文（特典・期間）か準備中の状態が変わった（「準備中」タグでも特典が載っていれば listed のまま。特典が「後日追加予定」の施設だけ preparing）。`references/agent-brief.md` で担当に渡し、
     詳細ページを確かめて `yukimaji` を更新した草案を作らせる。
   - `missing_in_json`: JSON に `yukimaji: null` とあるのに掲載がある。同じく担当に渡して記入する。
   - `unmapped`: 新しく掲載された施設。スキー場一覧（本番 `ski-resorts?view=admin`）で名寄せし、
     `facility-map.json` に追記してから点検し直す。同定できなければ利用者に聞く（施設名と詳細URLを添える）。
   - `code_mismatch`: JSON の `majibu_url` と対応表の施設番号が違う。どちらが正しいか詳細ページで確かめて直す。
   - `delisted`: 掲載から消えた。一覧（https://majibu.jp/pickup/yukimaji/place.html ）で掲載終了を確かめ、
     `yukimaji: null` にする。シーズン切替で一覧が一時的に空になっているだけなら何もしない。
   - `no_json`: リフト券JSONが無い。雪マジだけのJSONは作らない（割引の「500円引き」「半額」は通常料金が要り、
     計算はリフト券JSONを前提にしている）。`src/private/data/lift-ticket-workflow/` の台帳で保留理由を確かめ、
     今季料金が発表されていれば collect-ski-lift-ticket-pricing で収集する（`yukimaji` は Stage 1b で一緒に記入される）。
     未発表なら保留のまま、件数だけ報告する。

3. **差分を監査する。** 草案ごとに確定版との差分を見る（`python3 -m json.tool --sort-keys` 同士の diff）。
   - 変わっているのが `yukimaji` と、雪マジの出典（`sources` の該当項目の取得日・notes）だけであること。
   - `benefit_text_ja` / `period_text_ja` が掲載文と一致し、`period`・`day_rule`・`max_uses`・`night_policy`・
     `price_rules`・`fees` がその文と矛盾しないこと。
   - 本番に残る欄（`notes_ja` など）に作業領域のパスを書いていないこと。

4. **本番へ反映する。** 依頼が「調べて」だけなら反映しない。反映まで依頼されていれば、確定版を作業領域へ退避し、
   草案を確定版の場所へ置いて:

   ```bash
   mise run lift-ticket:publish -- --resort <id> --season <season>          # 差分の確認
   mise run lift-ticket:publish -- --resort <id> --season <season> --apply  # 反映
   ```

   差分に自分が変えていない箇所（管理画面での修正など）が出たら反映せず、退避した確定版を戻して
   `--pull` で本番を取り込み、草案を作り直す。

5. **点検し直す。** 同じ `check` を実行し、反映した施設が `current` になったことを確かめる。作業領域を消す。

## 書き方の決まり

- 掲載文のまま記録する。「平日」に祝日を含むかなど、書かれていないことは補わず `null` / `unresolved_questions` に残す。
- 共通ルール（対象生年月日、リクルートID登録、身分証原本、無料は1施設2回まで）は書かない。計算側の定数。
- 無料と割引は別々に書く（`free_coupon` / `discount_coupon`）。割引額の記載が無ければ `discount_coupon: null`。
- 割引後の金額は `fixed_total`、「半額」「30%OFF」は `discount_percent`、「1,000円引き」は `discount_amount`。
  平日・休日や期間で額が違えば `calendar_ids` で分ける。

## 完了報告

1項目1文の箇条書きで書く。
- 点検の件数（状態ごと）と、反映した施設・変えた内容。
- `no_json` の件数と、今季料金の発表を待っている施設数。
- 利用者に確かめてほしいこと（各行に詳細ページのURL）。
