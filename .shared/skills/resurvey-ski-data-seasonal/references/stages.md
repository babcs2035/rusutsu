# 段階ごとの進め方と完了の条件

どの段階も、作業そのものは担当スキルの `SKILL.md` が正本。ここには、再調査として回すときの入口・順番・`done` にする条件だけを書く。
以下の `seasonal.mjs` は `node .claude/skills/resurvey-ski-data-seasonal/scripts/seasonal.mjs`。

## baseline（1回）

1. 週次の見回りを全種類で流す。作業領域は再調査のあいだ使うので、名前を決めて残す。

   ```bash
   node .claude/skills/maintain-ski-data-weekly/scripts/weekly.mjs run \
     --run src/private/data/resorts-temporary/tmp/maintenance/<season>-seasonal/baseline
   ```

2. `summary.md` の高の指摘のうち、営業中のスキー場の画面が壊れているもの（表示できないマップ、ページが無いリンク）だけ先に直す。
   それ以外は後の段階でまとめて直るので、ここでは直さない。
3. `baseline/pages/leads.json` が `survey` の材料になる。

完了の条件: `summary.md` ができ、点検できなかった種類が無い。`mark --stage baseline --status done`。

## survey（スキー場、3件ずつ）

`SKILL.md` の手順3と `references/survey-brief.md` のとおり。営業中のスキー場から先に回る（`next` がその順で返す）。

- 2体を並べて、それぞれに3スキー場のバッチを渡す。1体が返ったら `audit-survey` と抜き取り確認をして、次のバッチを渡す。
- 30スキー場ほど進むごとに `plan` を流す。`survey` を全部終えてからでなくても、後の段階を並行して始められる。

完了の条件: `audit-survey` が通る（通ると自動で `done` になる）。サイトが落ちていて調べられないスキー場は、
日を改めて1回やり直し、それでも駄目なら `mark --stage survey --status hold --note "…"`。

## crawler（スキー場）

対象は `plan` が `todo` にしたスキー場: 営業情報・お知らせ一覧の取得先が変わった、または営業情報のページが新しくできた。
`next --stage crawler` のメモに、見て回りで見つけたURLが入っている。

- 既にクローラーがある: `build-ski-resort-latest-crawler` の手順で、見つかったURLを確かめ直してから取得先と抽出を直す。
  冬季アーカイブでの確認・失敗経路の検証は同スキルの決まりのとおり省かない。
- クローラーが無く、営業情報のページが新しくできた: 同スキルで新しく作る。
- お知らせ一覧だけが見つかった・変わった: クローラーは作らず、リンク文書の `newsUrls` を直す
  （`check-ski-resort-link-health` の `apply`。新しく足す場合は管理画面のリンク編集）。
- 開業前で当日の状態がまだ載っていない: 同スキルの冬季アーカイブの手順で作れるなら作り、作れなければ
  `hold` にして開業予定日をメモに書く（開業後に週次の見回りの `triage-ski-crawler-health` で警告として出る）。

完了の条件: 同スキルの検証を通し、本番の定時実行で保存されたことを `triage-ski-crawler-health` の `check --ids` で確かめた。
次の定時実行を待つあいだは `todo` のままにして、確かめてから `done` にする。

## tickets（スキー場）

対象は `plan` が `todo` にしたスキー場: 今季料金が発表済みで手元のデータが前のシーズン、または料金・レンタルのページが変わった。

- `next --stage tickets --size 20` で20件ずつ取り、`collect-ski-lift-ticket-pricing` の `references/batch-workflow.md` の
  進め方で回す（同スキルの台帳 `lift-ticket-workflow/<run-id>/run.json` に、この再調査の段階であることを書く）。
- 見て回りで見つかった新しい料金・レンタルのページは、同スキルの Stage 0 で公式URLに登録してから集める。
- **レンタルも集める。** レンタル料金のページがあるのにデータに `rentals` が無いスキー場は、この機会に足す。
- **料金照会まで通す。** 「集めた」ではなく、日付と人数を入れて料金が計算できることを同スキルの照会テストで確かめる。
- `hold`（今季料金が未発表）のスキー場は触らない。発表は週次の見回り（`watch-ski-official-pages`）が拾う。

完了の条件: 同スキルの機械検証・独立監査・料金照会が通り、本番へ反映した。

## maps（スキー場）

対象は、`plan` が `todo` にしたスキー場（マップのページ・図が変わった）と、`baseline` の `maps/tasks.json` に出たスキー場。

1. `maintain-ski-trail-maps` の `check` は `baseline` で済んでいる。`baseline/maps/tasks.json` のバッチをそのスキルの手順で片付ける。
2. `plan` が `todo` にしたスキー場のうち、1で扱っていないものは、見て回りで見つけたページを同スキルの `scan` に通して候補を出し、
   同スキルの担当への依頼文（`find`・`review`）で図を決める。

   ```bash
   node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs scan '<見つけたページのURL>' --size --check '<登録中の図のURL>'
   ```

3. 決定の確認（`sheet`）・反映（`apply`）・実画面の確認（`render`）は同スキルのとおり。

完了の条件: 反映後の `check --ids` で指摘が消え、`render` でPC・スマホとも枠に収まって表示される。

## links（スキー場、3件ずつ）

全スキー場を `collect-ski-resort-official-links` で集め直す（`prepare` → 調査 → `audit --write` → 差分 → 反映）。
前回の収集結果が材料に入るので、担当は「前回のURLが今もその種類のページか」と「種類ごとに新しいページが無いか」を見る。
`survey` で公式サイトが移転したスキー場は、リンク文書の公式サイトを直してから始める。

完了の条件: 同スキルの完了条件（どの種類にも found / none / unchecked、`audit` の `!` が0件）を満たし、本番へ反映した。

## yukimaji（1回）

`maintain-ski-yukimaji` を通しで行う。料金データが無くて保留だった施設（`no_json`）は、`tickets` の段階で
今季料金を集めたときに一緒に記入されているはずなので、最後に点検し直して件数を確かめる。

完了の条件: 点検で `text_changed`・`missing_in_json`・`unmapped`・`code_mismatch` が0件。

## listings（1回）

`maintain-ski-external-listings` を通しで行う。シーズン前は、ツアー会社が今季の一覧を出し始める時期と重なる。
- 一覧が大きく減ったサイトは、今季の掲載がまだ出そろっていないだけのことがある。サイトを開いて確かめ、反映を急がない。
- 続けて取れないサイト・終わったサービスは、やめるかどうかをユーザーに確認する。
- 新しい外部サイトを足したいかを、ユーザーに1回だけ聞く（足すサイトはユーザーが指定する）。

完了の条件: 取れなくなったサイトの扱いが決まり、掲載の変化を本番へ反映した。

## link-health（1回）

`links`・`crawler` の後に行う（集め直しで直るリンクを二度見ないため）。動画も含める。

```bash
node .claude/skills/check-ski-resort-link-health/scripts/link-health.mjs check \
  --run src/private/data/resorts-temporary/tmp/maintenance/<season>-seasonal/link-health \
  --scope official,external,legacy,video
```

完了の条件: 高・中の指摘が0件、または残りがユーザーの判断待ちとして報告に載っている。

## wrapup（1回）

1. 週次の見回りを全種類で流し直す（`--run …/<season>-seasonal/wrapup`）。
2. `pages` に残った指摘のうち、再調査で「関係のないページ」「料金は変わっていない」と確かめたスキー場を、
   `page-watch.mjs check --ids <id> --accept <id>` で基準にする。確かめていないものは基準にしない。
3. `known-issues.json` を見直す。直ったもの・サイトをやめたものを外す。
4. `seasonal.mjs status` の表と、`wrapup/summary.md` の件数（`baseline` と比べた減り方）を報告する。

完了の条件: `status` に「これから」「未判定」が残っていない（残りは保留と不要だけ）。保留の一覧を報告に載せた。
