---
name: triage-ski-crawler-health
description: 営業情報クローラー（crawl_latest）の本番の実行記録を全スキー場ぶん集計し、失敗が続いている・一部を保存できていない・実行が止まっている・警告が出ているスキー場を見つけて、原因ごとにまとめ、直す順番を決めて fix-ski-resort-latest-crawler へ回す。「クローラーの失敗を調べて」「営業情報が取れていないスキー場を出して」「クローラーの警告をまとめて」「クローラーを全部点検して」「今週クローラーは大丈夫？」のような依頼で使う。1スキー場の不具合を直すだけなら fix-ski-resort-latest-crawler、新しく作る・取得先を探し直すなら build-ski-resort-latest-crawler を使う。
---

# 営業情報クローラーの点検

本番で毎日動く営業情報クローラーの結果を1回の集計で見渡し、直すべきスキー場と順番を決める。
このSkillは「どこが・どう壊れているか」を出すところまでを持ち、直し方は `fix-ski-resort-latest-crawler` が正本。

## 正本と参照先

このSkillの正本は `.shared/skills/triage-ski-crawler-health/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| 集計 | `scripts/crawler-health.mjs check` |
| 1スキー場の原因調査と修正 | `.shared/skills/fix-ski-resort-latest-crawler/SKILL.md` |
| 取得先の探し直し・新規作成 | `.shared/skills/build-ski-resort-latest-crawler/SKILL.md` |
| 既知の問題（分かっていて今は直せないもの） | `src/private/data/maintenance/known-issues.json`（`area: "crawlers"`） |
| 人の判断待ちの経緯 | `src/private/scripts/crawl_latest/TODO-crawl-failures-human-review.md` |

データ:
- 読むもの: 本番の `/api/admin/crawl/monitor`（`.env.local` の `API_BASE_URL` と `API_BEARER_TOKEN`）。読むだけで、書き込まない。
- 作業領域: `src/private/data/resorts-temporary/tmp/maintenance/<run-id>/crawlers/`（Git管理外）。

## 手順

1. **集計する。** 数秒で終わる。

   ```bash
   node .claude/skills/triage-ski-crawler-health/scripts/crawler-health.mjs check \
     --run src/private/data/resorts-temporary/tmp/maintenance/<run-id>/crawlers
   ```

   `summary.md` に件数と一覧、`tasks.json` に直す対象（5スキー場ずつ。本番の run ID・エラーの例つき）が出る。
   `--days 14` で見る期間を、`--ids a,b` で対象を変えられる。

2. **指摘を読む。**

   | 指摘 | 重さ | 意味 |
   | --- | --- | --- |
   | `failing` | 高 | 直近が失敗で、この期間に3日以上失敗している |
   | `failed-latest` | 中 | 直近の実行だけ失敗（一時的な不調のこともある） |
   | `partial-error` | 中 | 保存はできたが、天気・リフト・コースなどの一部が空・不正で、画面の現在値に採用されていない |
   | `stale` | 中 | 他のスキー場は動いているのに、そのスキー場だけ実行が止まっている |
   | `no-run` | 中 | クローラーのファイルはあるのに、本番の実行記録が無い |
   | `warning` | 低 | 警告付きで保存できている |
   | `flaky` | 低 | 直近は成功だが、期間内に3日以上失敗している |
   | `mapping-gap` | 低 | 地図のコース・リフト名と、取れた名前が合っていない |

3. **原因ごとにまとめる。** 同じ原因を1件ずつ別々に直さないために、`tasks.json` のエラーの例を見て先に仕分ける。
   - **同じ共通コードを使うスキー場が一緒に失敗している**（白山・ニセコなど。`crawlerFile` が読む `shared/` が同じ）: 1件として直す。
   - **アクセス拒否（HTTP 403）・毎回のタイムアウト**: 本番のサーバーからだけ拒否されていることがある。
     手元で `mise run crawl:latest -- --local-files --resort <id>` を動かし、手元では取れるなら、コードでは直らない。
     拒否を回避するコードは入れない。ユーザーに「本番の定時実行から外す・別の送信元で動かす・運営に許可を求める」のどれにするか聞き、
     決まるまでは既知の問題に登録する（手順5）。
   - **ページが無い（404）・サイトの作りが変わった**: 取得先が変わっている。`build-ski-resort-latest-crawler` の
     `references/url-discovery.md` で今の営業情報のページを探し直してから直す。
   - **開業前で公式に営業情報がまだ出ていない**: クローラーのファイル先頭のTODOを確かめる。開業後に直る見込みなら、
     直さずに「開業後に再点検」として報告する。
   - **`stale`・`no-run`**: コードではなく定時実行の対象から漏れている。`scripts/runCrawlLatestBatch.ts` の対象の決め方と、
     そのスキー場のファイル名・IDが本番のスキー場IDと合っているかを確かめる。

4. **直す。** 依頼が「調べて」だけなら直さず、仕分けた結果を報告する。直すところまで依頼されていれば、
   `tasks.json` のバッチを優先順（`failing` → `stale`・`no-run` → `failed-latest` → `partial-error`）に、
   `fix-ski-resort-latest-crawler` の手順で1スキー場ずつ直す。プロジェクトの `AGENTS.md` のコスト方針に従い
   （Claude Code では `sonnet`）、範囲の決まった調査・修正はサブエージェントへ渡す。同時に動かすのは最大2体。
   原因の判断・本番の保存DOMとの照合・検証は親が行う。全バッチが終わるまで止めない。

5. **既知の問題を登録する。** ユーザーが「今は直さない」と決めたものだけ、`known-issues.json` に足す。

   ```json
   { "area": "crawlers", "id": "<resort-id>", "reason": "なぜ直せないか・誰の判断待ちか", "addedAt": "YYYY-MM-DD", "until": "YYYY-MM-DD" }
   ```

   `until` を書くと、その日を過ぎたら再び要対応に戻る（開業後に再確認したいものに使う）。
   登録したものは報告の「既知」の欄に理由つきで出続ける。消えたわけではないので、直ったら外す。

6. **確かめる。** 直したクローラーが本番で動くのは次の定時実行の後。翌日以降に `check --ids <直したID>` を流し、
   指摘が消えたことを確かめる。手元の実行やHTTPの応答だけで「本番で直った」と報告しない。

## 完了報告

1項目1文の箇条書きで書く。
- 直近の実行結果の件数（成功・警告付き・失敗）と、指摘ごとの件数。
- 原因ごとのまとまり（共通コード・アクセス拒否・取得先の変更・開業前）と、それぞれのスキー場。
- 直したスキー場と、本番で確かめたもの・次の定時実行を待っているもの。
- ユーザーに決めてほしいこと（各行に、そのスキー場の営業情報のページのURL）。
