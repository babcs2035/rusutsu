---
name: check-ski-resort-link-health
description: スキー場に登録してあるリンク（resort_links の公式リンク・ツアー会社など外部サイトのリンク、リンク文書の公式サイト・スクール・お知らせ一覧・YouTube動画）を全部開いて、切れている・別のサイトへ転送される・トップページへ戻される・「ページがありません」と出る・ドメインが失効しているリンクを見つけ、持ち主のスキルへ回す。公式サイト・スクール・お知らせ一覧・動画の切れたURLは、新しいURLを探して本番のリンク文書を直す。「リンク切れを調べて」「リンクが変わっていないか見て」「公式サイトのURLが古いのを直して」「切れているリンクを全部出して」「サイトが移転したスキー場を探して」のような依頼で使う。リンクを新しく集めるのは collect-ski-resort-official-links、ゲレンデマップは maintain-ski-trail-maps、リフト券の料金ページは watch-ski-official-pages が見る。
---

# リンク切れの点検

画面に出しているリンクが今も開けるかを、全スキー場ぶん数分で確かめる。
リンクの持ち主は種類ごとに別のスキルなので、このSkillは「切れているものを見つけて、持ち主へ回す」ことと、
持ち主のスキルが無いリンク文書の項目（公式サイト・スクール・お知らせ一覧・動画）を直すことを持つ。

## 正本と参照先

このSkillの正本は `.shared/skills/check-ski-resort-link-health/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| 点検・リンク文書の直し | `scripts/link-health.mjs`（`check` / `apply`） |
| 既知の問題 | `src/private/data/maintenance/known-issues.json`（`area: "links"`） |

データ:
- 読むもの: 本番の `resort_links`（全行）と DataDocument `SkiResortLinks.json`。
- 続けて失敗している回数: `src/private/data/maintenance/link-health-state.json`（Git管理。点検のたびに更新）。
- 反映記録: `src/private/data/maintenance/link-fixes/<日付>.json`（Git管理。バックアップの場所も記録）。
- 作業領域: `src/private/data/resorts-temporary/tmp/maintenance/<run-id>/links/`（Git管理外）。

## 見るもの・見ないもの

| scope | 中身 | 切れていたときの持ち主 |
| --- | --- | --- |
| `official` | resort_links の公式の行（アクセス・駐車場・レンタル店・ライブカメラなど） | `collect-ski-resort-official-links` |
| `external` | resort_links の外部サイトの行（ツアー会社・パス） | `maintain-ski-external-listings` |
| `legacy` | リンク文書の公式サイト・スキー/スノーボードスクール・スキー場情報・お知らせ一覧 | このSkill（下の「直し方」） |
| `video` | リンク文書のYouTube動画（リフト動画など） | このSkill（下の「直し方」） |

既定は `official,external,legacy`。動画は約1,100本あり、消えるのはまれなので、シーズン前の再調査で `--scope video` を足す。

X・Instagram・Facebook・LINE・Googleマップ・天気サイトは、自動アクセスにはどのURLにも同じ画面を返すので、切れているかを確かめられない。
対象に入れていない。ゲレンデマップは `maintain-ski-trail-maps`、リフト券の料金ページは `watch-ski-official-pages` が見る。

## 手順

1. **点検する。** 全件（約3,600件）で2分ほど。

   ```bash
   node .claude/skills/check-ski-resort-link-health/scripts/link-health.mjs check \
     --run src/private/data/resorts-temporary/tmp/maintenance/<run-id>/links
   ```

   `--ids a,b` で対象のスキー場を、`--scope` で種類を絞れる。試しに動かすときは `--no-state` を付けて、続けて失敗している回数を書き換えない。
   つながらない・拒否されたリンクは、最後に実際のブラウザで開き直してから判定する。

2. **指摘を読む。**

   | 指摘 | 重さ | 意味 |
   | --- | --- | --- |
   | `not-found` | 高 | ページが無い（404・410） |
   | `dns-gone` | 高 | ドメインが引けない。サイトごと無くなった可能性 |
   | `parked` | 高 | ドメインが売りに出ている・失効した表示 |
   | `moved-domain` | 中 | 別のサイトへ転送される（サイトの移転） |
   | `redirected-top` | 中 | トップページへ戻される（元のページが無くなった） |
   | `soft-404` | 中 | 開けるが「ページがありません」と表示される |
   | `video-gone` | 中 | 動画が削除された |
   | `unreachable`・`server-error` | 低 → 中 → 高 | つながらない・サイト側のエラー。1回目は低、2回続けば中、3回で高 |
   | `blocked`・`video-private` | 低 | 自動アクセスを拒否・非公開。切れているかは分からない |

3. **持ち主へ回す。** `summary.md` の「次に回す先」と `tasks.json` に、持ち主ごとの対象が出る。
   - `official`: そのスキー場を `collect-ski-resort-official-links` で調べ直す（切れた種類の新しいページを探し、無ければ `none`）。
   - `external`: `maintain-ski-external-listings` で、そのサイトの一覧を取り直す。
   - `legacy`・`video`: 下の「直し方」。

   依頼が「調べて」だけなら、ここまでを報告する。

4. **再点検する。** 直した後、`check --ids <直したスキー場>` で指摘が消えたことを確かめる。

## 直し方（リンク文書の公式サイト・スクール・お知らせ一覧・動画）

1. `tasks.json` の `legacy`・`video` の各URLについて、新しいURLを決める。
   - `moved-domain`: 転送先（`finalUrl`）を開き、同じスキー場の同じ内容のページであることを確かめて採る。
     運営会社のトップや、別施設のページへ飛ぶだけなら、移転先のサイト内で該当のページを探す。
   - `redirected-top`・`not-found`・`soft-404`: 公式サイトのトップから、その内容（スクール案内など）のページを探す。
     公式サイト自体が無くなっていれば、スキー場名で検索して現在の公式サイトを探し、施設名・所在地・運営者が合うことをページで確かめる。
   - 新しいページが無い（スクールをやめた、動画が消えた）なら、その項目を外す（`to: null`）。
   - スキー場そのものが閉鎖・休止していそうなら、直さずにユーザーへ報告する（営業状態を変えるのはこのSkillの範囲外）。

   プロジェクトの `AGENTS.md` のコスト方針に従い（Claude Code では `sonnet`）、10件を超えるときは20件ずつサブエージェントへ渡す。
   渡すのは `tasks.json` の該当バッチと、この節の決め方、返す形（下の決定ファイル）だけ。同時に最大2体。

2. 決定ファイルを書く。`owner`・`field`・`from` は `tasks.json` の `refs` の `owner`・`where`・`registered` をそのまま使う。

   ```json
   [
     { "owner": "hiraya-kogen", "field": "officialSiteUrls", "from": "https://hiraya-kougen.com/winter/index.php", "to": "https://…", "reason": "サイト改修でURLが変わった。施設名と所在地をページで確認" },
     { "owner": "hiraya-kogen", "field": "snowboardSchoolUrls", "from": "https://…", "to": null, "reason": "スクール案内のページが無くなった" }
   ]
   ```

3. 差分を確かめる。新しいURLが開けることもここで確かめる。

   ```bash
   node .claude/skills/check-ski-resort-link-health/scripts/link-health.mjs apply --decisions <decisions.json>
   ```

4. 反映まで依頼されていれば `--apply` を付ける。リンク文書の版が点検後に変わっていたら書かずに止まるので、やり直す。
   書いた後は読み戻して一致を確かめ、反映記録とバックアップを残す。

公式サイトのURLを変えたスキー場は、ほかの仕組みもそのサイトを見ている。営業情報クローラー・リフト券の公式URL・ゲレンデマップの掲載元が
古いサイトのままになっていないかを、それぞれのスキルの点検（`triage-ski-crawler-health`・`watch-ski-official-pages`・`maintain-ski-trail-maps`）で確かめる。

## 既知の問題

自動アクセスを拒否するだけで、人が開けば見られるサイトは `blocked`（低）のままでよい。
切れているのが分かっていて、ユーザーが「載せたままにする」と決めたリンクだけ、`known-issues.json` に足す。

```json
{ "area": "links", "id": "<resort-id>", "url": "<そのURL>", "reason": "…", "addedAt": "YYYY-MM-DD" }
```

## 完了報告

1項目1文の箇条書きで書く。
- 点検した件数と、指摘ごとの件数（直す前 → 直した後）。
- 持ち主へ回したスキー場（持ち主のスキルごと）。
- 直したリンク（スキー場・項目・旧URL → 新URL）と、外した項目。
- 新しいURLが見つからなかったもの・閉鎖や休止が疑われるスキー場（各行にURL）。
- 自動では確かめられなかった件数（`blocked`）。
