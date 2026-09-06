---
name: build-ski-resort-latest-crawler
description: 指定されたスキー場公式URLをPlaywrightと冬季Waybackアーカイブで調査し、src/private/scripts/crawl_latest/resortsの営業情報クローラーを実装・修正・監査する。URL探索は行わず、コース、リフト、天気、積雪、コメント等の取得、既存クローラーの不具合調査、DOM変更に強い抽出設計に使う。
---

# Build Ski Resort Latest Crawler

指定された公式URLから、根拠を検証できる情報だけを取得するクローラーを完成させる。

## 入力と範囲

- 必須入力はスキー場IDと調査対象の公式URL。対象を特定できない場合だけ確認する。
- 別サイトや別スキー場のURLは探索しない。同じURLのWaybackアーカイブと、ページが直接参照するAPI・CSS・JavaScript・画像は調査してよい。
- 提供URLに掲載され、既存型で正確に表現できるカテゴリは省略しない。一方、掲載のない情報や意味を確認できない値は作らない。

## 着手前に読むもの

1. `src/private/scripts/crawl_latest/resorts/template.ts`
2. `src/private/scripts/crawl_latest/shared/type.ts`
3. `src/private/scripts/crawl_latest/shared/utils.ts`
4. `shared` を使う完成度の高い既存クローラー
5. [implementation-guidelines.md](references/implementation-guidelines.md)

既存ファイルは参考例であり、URL・セレクター・保存処理が完成していることを確認してから使う。抽出ロジックを変更しない単純な整形・型修正では、ガイドの関連節だけ読めばよい。

## ワークフロー

### 1. 公式DOMを調査する

各URLをPlaywrightで開き、必要なタブ操作と待機後の完全HTMLを保存する。単純なページでは同梱スクリプトを使う。

```bash
node .shared/skills/build-ski-resort-latest-crawler/scripts/capture-rendered-pages.mjs \
  --out src/private/data/resorts-temporary/crawl_latest_dom/<resort-id> \
  --url '<official-url>' \
  --wait-for '<required-selector>'
```

保存対象はレンダリング後HTMLとconsole errorだけとする。HTML上で、コメント、天気、気温、地点別の積雪、降雪、雪質、風速、更新日時、コース、リフトを「掲載あり／掲載なし／値なし」に分類する。

現在がオフシーズン、または値・行が空なら、同じ公式URLの直近営業中のWaybackスナップショットも調査する。アーカイブには現在と同じ抽出経路を適用し、状態の意味、名前、件数、季節限定DOMを確認する。アーカイブ値を現行値として保存しない。

### 2. 取得範囲を決める

- 公式表示、公式凡例、または営業中アーカイブで意味を確認できた値だけを変換する。
- 不明な状態は推測せず `null` とし、公式の生値を項目の `note` に残す。
- DOM取得失敗、セレクター不一致、空欄を無条件に全件クローズへ変換しない。
- 安定した抽出経路を検証できないカテゴリは空にし、ファイル先頭へ再調査TODOを残す。確認済みのカテゴリは通常どおり実装する。

冬季監査、空欄時の全閉鎖フォールバック、画像天気、欠損カテゴリの判断基準は[実装ガイド](references/implementation-guidelines.md)に従う。

### 3. 実装する

- `src/private/scripts/crawl_latest/resorts/<resort-id>.ts` に実装し、`crawl_latest/shared` の型・navigation・正規化・検証関数を使う。
- 運用中のDOMは、例外、必須セレクター消失、想定外の生値、件数・重複・URL等の検証警告、クローラープロセスの `console.warn` / `console.error` が発生した実行だけ診断用に保存する。正常かつ無警告のDOMは保存しない。
- 「営業中」と「閉鎖中」だけを想定した変換に「一部閉鎖」が来た場合のように、辞書にない入力は推測変換せず警告する。想定外値を `null` と `note` に残すだけで、警告を省略しない。
- 必須ページと必須カテゴリの取得失敗時は不完全な結果を最新値として保存せず、警告と対応するDOMの保存完了を待ってから終了する。
- 抽出中の例外はページを閉じる前に `console.error` へ渡し、`process.exitCode = 1` にしてから `finally` でbrowserを閉じる。これにより例外時のレンダリング済みDOMとremote API結果を確定してからプロセスを終える。
- `courseNameMap` と `liftNameMap` は空でも残す。全コース・リフトを `checkCourse` / `checkLift` に渡し、`status: null` の警告も隠さない。
- `comment` は現在の営業・ゲレンデ情報にある専用コメント欄だけから取得する。ニュースやブログで補完しない。
- 各 `update` は、そのカテゴリについて公式が掲載する更新日時だけを使う。クロール時刻や別カテゴリの日時で補完しない。
- `note`、名前の正規化、source URL、欠損値、保存処理は実装ガイドの出力規則に従う。
- 保存は必ず `await Utils.saveLatestResult(...)` とする。個別クローラーから `fs.writeFile` で最新JSONを直接書かない。
- `shared/utils` はクローラーのエントリポイントを読み込んだ時点から診断を開始する。browser launchやpage作成前の失敗でも、終了前に失敗runとissueを確定する。DOMがない実行はDOMを捏造せずメタデータだけ残す。
- カテゴリが特定できる警告・失敗はそのカテゴリだけ現在値への昇格を止める。複数カテゴリの失敗は対象ごとに記録する。特定不能の取得・検証警告は根拠不足として全カテゴリを保留し、推測で範囲を狭めない。診断保存自体の失敗は、既に検証できたカテゴリの内容を不正扱いにしない。
- `--local-files` の子プロセスへAPI URL・APIトークン・DB接続文字列の秘密値を渡さない（空文字でdotenvの再読込みも防ぐ）。remote実行ではDOMと生結果をメモリに保持し、API側の非公開volumeだけへgzipを保存する。worker側へDOMを二重保存しない。
- DOMの保存期間は既定30日、`CRAWLER_ARTIFACT_RETENTION_DAYS` で1〜3650日に設定する。期限後はDOMだけを削除し、run・issue・hashは残す。`crawl:diagnostics:pull -- --resort <id>` はDOM取得不可のrunでも `run.json` を保存する。
- 雪マジも同じredaction・run/issue・gzip volume・診断取得を使う。`--resort yuki-magi` で取得できる。雪マジ施設は全件の取得・検証完了前にDB更新しない。

### 4. 検証する

1. 現行URLで実行し、保存JSONのスキー場ID、名前、状態、件数、URL、`note`、`update`、警告をDOMと照合する。
2. オフシーズンまたは状態の意味が現行DOMだけで確定しない場合は、`CRAWL_LATEST_ARCHIVE_TIMESTAMP=YYYYMMDD` を使うなどして、同じクローラー経路を冬季アーカイブでも検証する。
3. 正常・無警告で診断DOMが増えないことと、未知状態・必須DOM消失・件数異常の各テストで警告、DOM、診断メタデータが同じ実行IDで残ることを確認する。
4. 対象ファイルをBiomeで検査し、`mise run typecheck` を実行する。

正常に保存された現行・Waybackの検証JSONは残す。不完全な失敗結果だけを削除してよい。

## 完了報告

最終回答に「状態・取得範囲の監査」を含め、簡潔に次を示す。

- 現行ページと冬季アーカイブの対象URL・日時、カテゴリ別・状態別件数、警告
- コース／リフトの各状態について、根拠と実際に変換経路へ通した結果
- 全閉鎖フォールバックを使った場合は、固定在庫名・件数、空欄の根拠、コンテナ取得成功の判定
- 天気、気温、積雪、降雪、雪質、風速、コメント、各 `update` の取得可否と根拠
- 画像天気を使う場合は、調査した識別子と未知値警告のテスト結果
- 未確認の状態・カテゴリ、残したTODO、対応URLを残した／空にした理由、推測しなかった範囲
- 現行・Waybackの検証JSONパスと、Biome・型チェックの結果

単に「確認済み」とせず、何をどのDOM・凡例・アーカイブで確認し、何が未確認かを区別する。
