---
name: watch-ski-official-pages
description: スキー場の公式サイトの変化を、前回の指紋と比べてスクリプトで見つける。リフト券・レンタルの料金ページで料金の行が変わった・料金表のPDFや画像が差し替わった・新しいシーズンの表記が出た・ページが無くなった、公式サイトにまだ登録していない料金・レンタル・営業情報・マップのページへのリンクが増えた、を全スキー場ぶん出し、本当の変更かを見分けて、料金の更新（collect-ski-lift-ticket-pricing）やクローラーの取得先の見直しへ回す。「料金が変わっていないか調べて」「料金ページの変化を見て」「今季料金が発表されたスキー場を探して」「新しい料金ページやレンタルのページができていないか見て」「公式サイトに新しいページが増えていないか調べて」のような依頼で使う。料金を集め直す作業そのものは collect-ski-lift-ticket-pricing、営業情報クローラーの失敗は triage-ski-crawler-health を使う。
---

# 公式ページの変化の見張り

料金は公式が黙って書き換える。全スキー場の料金ページを人やエージェントが毎週読み直すのは無理なので、
スクリプトがページの指紋を前回と比べ、変わったスキー場だけをエージェントが見る。

## 正本と参照先

このSkillの正本は `.shared/skills/watch-ski-official-pages/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| 点検 | `scripts/page-watch.mjs check` |
| 変化が本当の変更かを見分ける担当への依頼文 | `references/agent-brief.md` |
| 料金・レンタルの更新、料金の公式URLの登録 | `.shared/skills/collect-ski-lift-ticket-pricing/SKILL.md`（URLは `references/source-discovery.md`） |
| 営業情報のページの確かめ方 | `.shared/skills/build-ski-resort-latest-crawler/references/url-discovery.md` |
| 既知の問題 | `src/private/data/maintenance/known-issues.json`（`area: "pages"`） |

データ:
- 見張るURL: `src/private/data/lift-ticket-source/<id>.json` の登録URLと、`src/private/data/lift-ticket/<id>/<season>.json` の出典。
  天気サイト・雪マジ（じゃらん）・Webアーカイブは見張らない（毎日変わる・別のスキルが見る・変わらない）。
- 前回の指紋: `src/private/data/maintenance/page-watch/<resortId>.json`（Git管理。料金の行そのものを持つので、差分が読める）。
- 作業領域: `src/private/data/resorts-temporary/tmp/maintenance/<run-id>/pages/`（Git管理外）。

## 何を比べるか

- **料金の行**: ページを実際に描画して本文を取り、「円」「¥」を含む行だけを抜き出して前回と比べる。
  お知らせや営業日の文面は比べない（試したところ1時間でも100ページ以上が変わり、指摘として使えなかった）。
- **料金の資料**: PDF・画像は中身のハッシュを比べる。
- **シーズンの表記**: 本文の「2026-27」「2026/2027」「26-27シーズン」を拾う。手元の料金データより新しいシーズンの表記が前回は無かったのに出たとき、
  料金データが未作成のスキー場で今季の表記があるときに指摘する。
- **未登録のページ**: 公式サイトのトップと料金ページにあるリンクのうち、文字やURLが料金・レンタル・営業情報・マップを指し、
  どこにも登録していないものを覚えておき、前回から増えたものを指摘する。お知らせの記事・外国語版・スクール・駐車場・宿泊は拾わない。

| 指摘 | 重さ | 意味 | 回す先 |
| --- | --- | --- | --- |
| `newer-season` | 高 | 料金ページに、手元のデータより新しいシーズンの表記が新しく出た（前からある「来季から…」の予告は基準に入っていて、指摘にならない） | collect-ski-lift-ticket-pricing |
| `season-published` | 高 | 料金データが未作成のスキー場で、今季の表記が出た（発表された可能性） | 同上 |
| `ticket-page-gone` | 高 | 登録済みの料金ページが無い（404・ドメイン消失） | 同上（公式URLの探し直しから） |
| `price-changed` | 中 | 料金の行が増えた・消えた | 同上 |
| `file-changed` | 中 | 料金表のPDF・画像が差し替わった | 同上 |
| `new-page-ticket`・`new-page-rental` | 中 | 未登録の料金・レンタルのページへのリンクが増えた | 同上（URLの登録と収集） |
| `new-page-status` | 中 | 未登録の営業情報のページへのリンクが増えた | build-ski-resort-latest-crawler |
| `new-page-map` | 低 | 未登録のマップのページへのリンクが増えた | maintain-ski-trail-maps |
| `ticket-page-error`・`ticket-page-blocked`・`top-page-error` | 低 | 一時的に開けない・自動アクセスを拒否 | なし（続くなら check-ski-resort-link-health の結果を見る） |

**基準の持ち方**: 初めて見るページは、指摘せずに基準として記録する。料金の変化（中以上）が出たページは、
集め直す（料金データの取得日時が検知より新しくなる）か `--accept` するまで前回の基準を保ち、点検のたびに同じ指摘を出す。
見逃しても次の点検で再び出る。未登録のページも、登録するか `--accept` するまで出続ける（リンクが公式サイトから消えたら出なくなる）。

## 手順

1. **点検する。** 全件（約450スキー場・料金ページ約1,700件）で12分ほどかかる（描画するため）。裏で動かして待つ。

   ```bash
   node .claude/skills/watch-ski-official-pages/scripts/page-watch.mjs check \
     --run src/private/data/resorts-temporary/tmp/maintenance/<run-id>/pages
   ```

   `--ids a,b` で対象を、`--only tickets`（料金ページだけ）・`--only pages`（未登録のページ探しだけ）で範囲を絞れる。
   試しに動かすときは `--no-state` を付けて基準を書き換えない。

2. **結果を読む。** `summary.md` に一覧、`tasks.json` に変化のあったスキー場（5件ずつ。増えた行・消えた行つき）、
   `leads.json` に未登録のページの手がかりの全件（新しく増えたものに限らない。シーズン前の再調査で使う）。

3. **本当の変更かを見分ける。** `price-changed`・`file-changed`・`new-page-*` は、指紋が変わったという事実だけで、
   料金が変わったとは限らない（キャンペーンの告知が載った、売り切れ表示が変わった、関係のないページだった）。
   `references/agent-brief.md` の依頼文で `tasks.json` のバッチを担当へ渡し、スキー場ごとに
   「料金・条件が変わった／変わっていない／判断できない」と根拠を返させる。
   プロジェクトの `AGENTS.md` のコスト方針に従う（Claude Code では `sonnet` / low）。同時に最大2体。
   数件なら親がそのページを開いて見分ける。`newer-season`・`season-published`・`ticket-page-gone` は見分けずに次へ回す。

4. **振り分ける。**
   - **変わった**: `collect-ski-lift-ticket-pricing` でそのスキー場を更新する（公式URLの再確認 → 抽出 → 独立監査 → 料金照会 → 反映）。
     新しい料金・レンタルのページが見つかったときは、同スキルの Stage 0 で公式URLに登録してから集める。
     レンタル料金が未収集のスキー場でレンタルのページが見つかったら、レンタルも集めて料金計算に使える形にする。
     営業情報のページなら `build-ski-resort-latest-crawler`、マップなら `maintain-ski-trail-maps` へ回す。
     依頼が「調べて」だけなら回さず、対象と根拠を報告する。
   - **変わっていない**: `check --ids <id> --accept <id>` で今の内容を基準にする。
   - **毎週同じ理由で変わる**（日ごとに料金が変わる販売ページ、在庫表示）: ユーザーに伝えたうえで `known-issues.json` に足す。

     ```json
     { "area": "pages", "id": "<resort-id>", "code": "price-changed", "url": "<そのURL>", "reason": "日ごとに料金が変わる販売ページ", "addedAt": "YYYY-MM-DD" }
     ```

5. **確かめる。** 更新・登録が済んだスキー場を `check --ids <id>` で点検し直し、指摘が消えたことを確かめる。

## 完了報告

1項目1文の箇条書きで書く。
- 点検したスキー場数・料金ページ数と、指摘ごとの件数。
- 料金・条件が変わっていたスキー場と、変わった内容（各行に料金ページのURL）。
- 今季料金が発表されたスキー場・料金ページが無くなったスキー場。
- 新しく見つかった料金・レンタル・営業情報・マップのページ（各行にURL）と、回した先。
- 変わっていないと判断して基準にしたスキー場、既知の問題に足したもの。
- 見分けられなかったもの（各行にURL）。
