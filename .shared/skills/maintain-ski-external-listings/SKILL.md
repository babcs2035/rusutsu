---
name: maintain-ski-external-listings
description: 外部サイトがどのスキー場を載せているか（ツアー会社18サイトのスキー場別リンク、NSDキッズ・マックアース・スノーバーズの対象スキー場）を取り直し、前回から載った・載らなくなったスキー場、対応づけられない名前、取れなくなったサイトを見つけて、本番の resort_links・絞り込みへ反映する。サイトが無くなった・続けて取れないときは、掲載をやめる手順まで行う。「ツアーリンクを更新して」「ツアー会社の掲載が変わっていないか見て」「パスの対象スキー場を更新して」「取れなくなったツアーサイトをやめて」「外部サイトの一覧を点検して」のような依頼で使う。公式サイト上のリンクは collect-ski-resort-official-links、雪マジは maintain-ski-yukimaji を使う。新しい外部サイトの追加は、ユーザーがサイトを指定したときだけ行う。
---

# 外部サイトの掲載の点検・更新

ツアー会社やパスのサイトは、シーズンごとに載せるスキー場を入れ替え、サイトごと無くなることもある。
このSkillは、掲載の変化を見つけて反映し、取れなくなったサイトの扱い（直す・やめる）を決める。

## 正本と参照先

このSkillの正本は `.shared/skills/maintain-ski-external-listings/`。`.agents/skills/` と `.claude/skills/` はシンボリックリンク。

| 必要なとき | 読むもの |
| --- | --- |
| 取り直しと前回との比較 | `scripts/listings.mjs check` |
| ツアーサイトごとの取り方 | `src/private/scripts/tour-links/sites/<siteId>.ts`、型は `src/private/scripts/tour-links/types.ts` |
| パスの一覧の読み方 | `src/private/scripts/pass-programs/parsers.ts`、定義は `src/shared/passPrograms.ts` |
| 出どころの表示名 | `src/features/resort-links/linkSources.json` |
| 既知の問題 | `src/private/data/maintenance/known-issues.json`（`area: "listings"`） |

データ:
- ツアーリンク: `src/private/data/tour-links/<siteId>.json`（Git管理。取り直しで上書きされる）。別名は同じ場所の `aliases.json`。
- パスの別名: `src/private/data/pass-programs/aliases.json`。
- 反映先: 本番の `resort_links`（ツアーリンク、NSDキッズ）と `pass_program_resorts`（絞り込み）。
- 続けて失敗している回数: `src/private/data/maintenance/listings-state.json`（Git管理）。
- 作業領域: `src/private/data/resorts-temporary/tmp/maintenance/<run-id>/listings/`（Git管理外。取り直す前の控えが `before/` に残る）。

本番アプリは毎週月曜4時にツアーリンクを自分で取り直して反映している。ただし失敗や「半分未満に減ったので見送り」は
外から見えないので、このSkillは手元で取り直して確かめる。

## 手順

1. **取り直して比べる。** ツアー会社の巡回に十数分かかる。裏で動かして待つ。

   ```bash
   node .claude/skills/maintain-ski-external-listings/scripts/listings.mjs check \
     --run src/private/data/resorts-temporary/tmp/maintenance/<run-id>/listings
   ```

   `--sites a,b` でサイトを絞れる。`--no-crawl` はツアーリンクを取り直さず、手元のファイルとパスだけを見る。

2. **指摘ごとに片付ける。**

   | 指摘 | 重さ | すること |
   | --- | --- | --- |
   | `listing-changed` | 中 | 載った・載らなくなったスキー場を読み、`mise run resort-links:publish -- --source <siteId>` で本番との差分を見る。反映まで依頼されていれば `--apply` |
   | `pass-changed` | 中 | 「パスの差分」を読み、反映まで依頼されていれば `mise run crawl:pass-programs -- <programId> --apply` |
   | `unmatched-name`・`pass-unmatched` | 低・中 | サイト上の名前がどのスキー場か、所在地で確かめて `aliases.json` に足し、そのサイトだけ取り直す。決められなければユーザーに聞く（名前とサイトのURLを添える） |
   | `crawl-failed`・`listing-empty`・`listing-shrunk`・`pass-failed`・`pass-shrunk` | 中 | 下の「取れなくなったサイト」 |
   | `retire-candidate` | 高 | サイトの入口が無い、または3回続けて取れない。下の「掲載をやめる」 |
   | `production-stale` | 中 | 手元は0件なのに本番に行が残っている。やめたサイトなら「掲載をやめる」の3で消す |
   | `unknown-source` | 中 | 本番にあって、クローラーに無い出どころ。やめたサイトの消し残りか、名前の変更かを確かめる |

   載らなくなったスキー場が多いとき（一覧の半分近く）は、サイトがシーズン前で一覧を出していないだけのことがある。
   サイトを開いて確かめ、そうなら反映せずに次の点検を待つ。

3. **取れなくなったサイト。** サイトの入口（`summary.md` のURL）を開いて、どれに当たるかを確かめる。
   - **ページの作りが変わった**: `sites/<siteId>.ts`（パスは `parsers.ts`）を今のページに合わせて直し、`--sites <siteId>` で取り直す。
     範囲の決まった修正なので、プロジェクトの `AGENTS.md` のコスト方針に従ってサブエージェント（Claude Code では `sonnet` / low）へ渡してよい。
     渡すのはサイトのファイル・型・入口のURL・「一覧のどこにスキー場名とリンクがあるか」だけ。直した後の件数と抜き取り3件のリンク先を親が確かめる。
   - **自動取得を拒否された（403・ボット対策）**: 回避するコードは入れない。ユーザーに伝え、既知の問題に足す。
   - **シーズン前で一覧が空**: 何もしない。次の点検で戻ることを確かめる。
   - **サイトやサービスが終わった**: 「掲載をやめる」へ。

4. **確かめる。** 反映したサイトは、`mise run resort-links:publish -- --source <siteId>` をもう一度流して差分が0件になったことを確かめ、
   載ったスキー場を2〜3件、詳細画面の「リンク」タブで開いてリンク先がそのスキー場のページであることを見る。

## 掲載をやめる

サイトが無くなった・取れないまま戻らないときに、リンクを画面から消す。古いリンクを残すと、利用者が切れたページへ飛ぶ。
本番のリンクを消す操作なので、**やめる前に必ずユーザーへ確認する**（サイト名、入口のURL、続けて取れていない回数、本番に残っている件数を1件1文で）。

ツアーサイト:
1. `src/private/data/tour-links/<siteId>.json` の `entries` を `[]` にする（`counts` も0にする）。
2. `mise run resort-links:publish -- --source <siteId>` で「今 N件 → 0件」と出ることを確かめる。
3. `mise run resort-links:publish -- --source <siteId> --allow-shrink --apply` で本番の行を消す。
4. `src/private/scripts/tour-links/sites/index.ts` の一覧から外し、`sites/<siteId>.ts` と `src/private/data/tour-links/<siteId>.json`、
   `src/features/resort-links/linkSources.json` の項目、`listings-state.json` と `known-issues.json` のそのサイトの記録を消す。
5. `mise run check` を通す。本番アプリの毎週の取り直しは、デプロイ後にそのサイトを巡回しなくなる。

パス（絞り込み）:
- 絞り込みの定義（`src/shared/passPrograms.ts`）と読み方（`parsers.ts`）から外す変更になり、ホームの絞り込みの表示も変わる。
  本番の対象一覧を空にするコマンドは用意していないので、やめると決まったら、消し方をユーザーと決めてから進める。

一時的に休んでいるだけ（来季に再開する告知がある）なら、やめずに既知の問題へ足し、`until` に再確認の日を書く。

```json
{ "area": "listings", "id": "<siteId>", "reason": "…", "addedAt": "YYYY-MM-DD", "until": "YYYY-MM-DD" }
```

## 完了報告

1項目1文の箇条書きで書く。
- 取り直したサイト数と、指摘ごとの件数。
- サイトごとの、載った・載らなくなったスキー場と、反映したかどうか。
- 取れなくなったサイトと原因（作りの変更・拒否・シーズン前・終了）、直したもの。
- 掲載をやめたサイト、やめるかをユーザーに決めてほしいサイト（各行にサイトのURL）。
- 対応づけを足した名前と、決められなかった名前（各行にサイトのURL）。
