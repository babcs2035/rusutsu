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

### 取得元と出典

- 取得の起点は、利用者が普段開く公式ページ。Playwrightでそのページを開き、表示後のDOMを読む。公式ページが埋め込むiframe、jQuery等で差し込まれる部品、公式ページ自身の通信で描画される値は、公式ページを開いたうえで `page.frames()`・`frameLocator`・表示後DOMから読む。埋め込み先・部品・APIのURLをコードに固定して直接開かない（シーズンでURLが変わっても追従できる）。
- 保存する値は、公式ページに表示されているものに限る。表示されないAPI専用の値・内部コード・更新日時は使わない。
- 観光協会・自治体・運営会社など公式に準じるサイトも取得元にしてよい。同じ情報を複数のページから取れる場合は、どれか1つに決めて読む（例: 白馬さのさかは `https://sanosaka.jp/` だけ）。予備のURLは、主のURLが失敗したときだけ使う。
- 出典（`weatherUrl` / `commentUrl` / `courseUrl` / `liftUrl`）は、その回に実際に値を読んだページのうち、利用者が普段開くページ。部品・埋め込み・APIのURLは出典にしない。開いたが値を使わなかったページ、使わなかった予備のURLは載せない。
- 同じページ内で近い位置の欄は1つの出典にまとめる。離れた欄や別ページから集めた場合だけ複数にし、`courseUrlLabels` / `liftUrlLabels` に同じ並びで短いラベル（例: `["コース", "パーク"]`）を付ける。画面には「出典1(コース)」「出典2(パーク)」と出る。

### 取得元の制限（yukiyama APIは禁止）

- yukiyamaは競合サービスのため、そのAPIをクローラーの取得元にしない。直接のHTTP取得・ページ遷移だけでなく、公式ページの通信を `waitForResponse` / `response.json()` 等で捕捉・解析すること、同一オリジンの中継APIやWayback保存APIを代替取得元にすることも禁止する。
- 公式ページ自身のJavaScriptが表示に必要な通信を行うことは許可されている。描画完了を待ち、公式ページの表示後DOMから名称・状態・備考・気象等を読む。サイト由来のclass名に `yukiyama` が含まれることは、このDOM取得を禁止する理由にならない。
- DOMに掲載されないAPI専用の値・内部コード・更新日時を補足しない。取得できない項目はnull/空として、必要な再調査TODOを残す。ニュースのAPIレスポンスやクローラーが注入したJSONもDOMの代用にしない。
- 上記の「ページが直接参照するAPIを調査してよい」は、APIを実装の取得元として採用する包括的な許可ではない。yukiyama APIの取得・レスポンス解析は禁止を優先し、公式ページの表示構造だけで実装・現行検証・アーカイブ再生を行う。
- 完了前に個別クローラー・共有抽出処理・取得元URLを横断確認し、直接API取得、通信レスポンス解析、API専用値の保存が残っていないことを検証する。

### 連携エリアの対象ID

- 着手時に `SkiResort.linkKind`、`mergedIntoId`、`sourceResortIds` と公開画面の読み取り経路を確認する。`LINKED` の親を指定された場合、親だけのクローラーで完了としない。所属する公開子スキー場ごとに `resorts/<child-id>.ts` を用意し、結果の `resortName` と `Utils.saveLatestResult` の保存先をそれぞれの子IDにする。抽出処理は `shared` で共用してよい。
- 共通の公式ページに複数スキー場のコース・リフトが載る場合も、行の所属を根拠に各子の結果へ振り分ける。天候・積雪・コメントと `weatherUrl` / `commentUrl` も子ごとに対応づける。`weatherUrl` は出典であり、画面のタブを指定する値ではない。所属を確認できない値を親へ一括保存したり、各子へ複製したりしない。
- `LINKED` のコース・リフトは画面側で子IDの現在値を合算し、コンディションは子IDでタブを切り替える。既存の親クローラーから移行する場合は、その親結果の利用先と子への移行状況を確認する。`MERGED` の親は別の公開単位なので、この分割規則を一律に適用しない。詳しくは[実装ガイドの連携エリア](references/implementation-guidelines.md#連携エリアの保存単位)を参照する。

## ローカル作業ファイルの保存先

- 調査・検証の成果物はすべて `src/private`（rusutsu-library）配下へ保存する。親rusutsuの `tmp/`、`logs/`、ルートやOSの `/tmp` を作業資料の保存先にしない。
- HTMLは既存の `src/private/data/resorts-temporary/crawl_latest_dom/<resort-id>/`、検証JSON・GeoJSON・監査メモ・再生スクリプト・実行ログは `src/private/data/resorts-temporary/tmp/<resort-id>-audit/` を使う。通常の実行ログは `src/private/data/resorts-temporary/logs/` に置く。
- 上記 `tmp/`・`logs/` はlibrary側でもGit管理対象外とし、ローカルに保持する。継続管理するデータや再利用する検証スクリプトは、用途別データディレクトリや `src/private/scripts/` に移して管理する。
- `--out`、`--report`、`CRAWLER_ARTIFACT_ROOT`、検証用JSON保存先、リダイレクト、`tee` のすべてに上記保存先を指定する。補助スクリプト内のパスも確認する。診断HTMLはlibrary側でもGit管理対象外にする。
- 本番remote実行の診断DOMは既存のAPI側非公開volumeへ保存し、workerへ二重保存しない。ローカルへの診断取得先だけをlibrary配下にする。

## 着手前に読むもの

既存クローラーの本番障害を調べる場合は、現行ページの再取得やコード修正の前に、対象の失敗runに紐づく保存DOMを診断APIから取得して確認する。`mise run crawl:diagnostics:pull -- --run-id <失敗run-id>` を使い、エラー・待機selector・HTTP状態・ソースハッシュを保存HTMLと照合する。`--resort` で取得したrunは別の警告実行や冬季検証の場合があるので、日時・sourceMode・run IDの一致を確認する。DOMがない場合は期限切れ・保存失敗等の理由を記録する。詳細は[修正スキル](../fix-ski-resort-latest-crawler/SKILL.md)を参照する。

以下は親エージェントの確認対象。子には担当に必要なファイル・節だけを渡し、全員に同じ資料を読ませない。

1. `src/private/scripts/crawl_latest/resorts/template.ts`
2. `src/private/scripts/crawl_latest/shared/type.ts`
3. `src/private/scripts/crawl_latest/shared/utils.ts`
4. `shared` を使う完成度の高い既存クローラー
5. [implementation-guidelines.md](references/implementation-guidelines.md)
6. 対象スキー場のcapability台帳（`resorts-temporary/latest_status_capability/<resort-id>.json`）。あれば冬季に何が取得できるかの基準になる

既存ファイルは参考例であり、URL・セレクター・保存処理が完成していることを確認してから使う。抽出ロジックを変更しない単純な整形・型修正では、ガイドの関連節だけ読めばよい。

## 消費を抑える分担

プロジェクトの `AGENTS.md` のコスト方針を適用し、範囲が明確な調査・照合・局所修正はLunaのサブエージェントへ委譲する（Claude Codeでは `CLAUDE.md` のとおり `sonnet` に読み替える）。数行の変更など委譲の手間が上回る場合は親が処理する。委譲時は [delegation.md](references/delegation.md) を読む。

- サブエージェントは `gpt-6-luna` に統一する。単純な抽出・整形・局所修正は `low`、DOMの読解・照合は `medium`、複雑な読解は `high` を明示し、`fork_turns: "none"` で必要な入力だけ渡す。局所実装もLunaへ任せ、解消できない問題は別モデルの子を起動せず親が引き取る。利用可能なモデルと指定方法は実行環境で確認する。
- 子は原則1体、独立した仕事が2つある場合だけ最大2体。同じ調査の重複、子からの再委譲、役割ごとの無条件な起動はしない。親は子の結果を待つ間に別の必要作業を進める。
- 子には保存DOMの事実整理、冬季との差分整理、既存ログの照合などを任せる。親は取得範囲・状態変換の判断、実装の統合、API保存と現在値への反映確認を担当する。
- 完全HTMLとログはファイルに保持し、会話には根拠の場所・件数・差分・未確認事項だけを返す。重要な状態変換と不明点は親が元資料で確認する。
- 総トークンと費用・利用枠の消費は別に評価する。委譲だけでは削減を保証しない。完了時に使用モデル・委譲範囲・再試行の有無を短く示し、実測できない削減率は述べない。

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
- コース・リフトの対象行・名称・状態欄を正常に取得でき、値が空欄（空文字・空白・ハイフン等の欠損記号）なら、季節を問わず `status: "×"` として正常保存する。画像・CSS・状態コードで表示される状態を文字の空欄と取り違えない。詳細は実装ガイドの「正常取得した空欄は通年で閉鎖」を参照する。
- 休止を意味する公式の文言（`運休`、`CLOSED`、`STANDBY` 等。凡例や同ページの表示で意味を確認したもの）は `"×"` にし、文言を `note` に残す。状態画像のない項目が休止を表すページ（例: geto-kogen の運行図）では、その規則をコードに書いて `"×"` にする。
- それ以外の意味を確定できない状態は推測せず `null` とする。画面では「不明」として出典付きで表示され、警告と診断DOMが残る。読み取れる文言は既存の備考を保ちながら各項目の `note` に残す。画像識別子や内部状態コードを無理に `note` に入れる必要はない。
- 公式ページに表・欄そのものがない場合は、そのカテゴリを空（`[]` / `{}`）にする（掲載なし）。画面ではコース・リフトは「不明」、天気・コメントは欄ごと出ない。DOMは残る。
- 公式に載っていない状態を、別の情報から推測して作らない（例: リフトが全部×だからコースも×）。コースごとの状態が載っていなければコースは空にする。
- DOM取得失敗、セレクター不一致、行・状態要素の消失は空欄と区別し、クローズへ変換しない。
- 安定した抽出経路を検証できないカテゴリは空にし、ファイル先頭へ再調査TODOを残す。確認済みのカテゴリは通常どおり実装する。

冬季監査、空欄と取得失敗の区別、capability台帳、画像天気、欠損カテゴリの判断基準は[実装ガイド](references/implementation-guidelines.md)に従う。

### 2.5 capability台帳を更新する

冬季アーカイブを調査したら、そこで取得できた内容をcapability台帳へ記録する。台帳はオフシーズンの実装・監査と、営業期間中の欠損警告の基準になる。

- コース・リフト：件数、名称一覧、実際に現れた状態記号、`name` / `status` / `update` / `note` のどれが埋まるか
- コンディション：観測地点名、`update` / `weather` / `temperature` / `snowDepth` / `snowfall` / `condition` / `windSpeed` の可否、`comment` 専用欄の有無
- 出典（`archiveTimestamp`、URL）と、その時点のクローラーのソースハッシュ

既存の台帳があり、抽出ロジックを変更していないなら作り直さない。抽出ロジックを変えたら作り直す。スキーマと保存先は実装ガイドの「capability台帳」に従う。

### 3. 実装する

- `src/private/scripts/crawl_latest/resorts/<resort-id>.ts` に実装し、`crawl_latest/shared` の型・navigation・正規化・検証関数を使う。
- 運用中のDOMは、例外、必須セレクター消失、想定外の生値、件数・重複・URL等の検証警告、クローラープロセスの `console.warn` / `console.error` が発生した実行だけ診断用に保存する。正常かつ無警告のDOMは保存しない。
- 「営業中」と「閉鎖中」だけを想定した変換に「一部閉鎖」が来た場合のように、辞書にない入力は推測変換せず警告する。想定外値を `null` と `note` に残すだけで、警告を省略しない。
- 必須ページと必須カテゴリの取得失敗時は不完全な結果を最新値として保存せず、警告と対応するDOMの保存完了を待ってから終了する。
- 抽出中の例外はページを閉じる前に `console.error` へ渡し、`process.exitCode = 1` にしてから `finally` でbrowserを閉じる。これにより例外時のレンダリング済みDOMとremote API結果を確定してからプロセスを終える。
- `courseNameMap` と `liftNameMap` は空でも残す。全コース・リフトを `checkCourse` / `checkLift` に渡し、`status: null` の警告も隠さない。
- `comment` は現在の営業・ゲレンデ情報にある専用コメント欄の本文。`commentUrl` はその本文を読んだページで、本文が取れた回だけ付ける（空なら送信時に自動で外れる）。
- お知らせ・ニュース一覧はクローラーでは扱わない。リンク集（`SkiResortLinks` の `newsUrls`）に登録し、詳細画面の「お知らせ」行に出る。「最新情報はこちら」のような案内文やリンクを `comment` や `note` に作らない。
- 各 `update` は、そのカテゴリについて公式が掲載する更新日時だけを使う。クロール時刻や別カテゴリの日時で補完しない。
- `note`、名前の正規化、source URL、欠損値、保存処理は実装ガイドの出力規則に従う。
- 保存は必ず `await Utils.saveLatestResult(...)` とする。個別クローラーから `fs.writeFile` で最新JSONを直接書かない。
- `shared/utils` はクローラーのエントリポイントを読み込んだ時点から診断を開始する。browser launchやpage作成前の失敗でも、終了前に失敗runとissueを確定する。DOMがない実行はDOMを捏造せずメタデータだけ残す。
- 表示を止めるのはエラー（`console.error`、navigation失敗、例外）と、明示的に止める警告だけ。件数が想定と違うときは `Utils.checkCourseLiftCount` が `Utils.warnBlocking` で止める。それ以外の `console.warn` は表示を止めず、警告とDOMを残す（「不明」「掲載なし」もそのまま表示される）。カテゴリが特定できる失敗はそのカテゴリだけを止め、特定できないエラーは全カテゴリを止める。診断保存自体の失敗は、既に検証できたカテゴリの内容を不正扱いにしない。
- コースかリフトが1件以上あり全部 `"×"` の実行では、天気・コメントが空や仮の値でも警告とそのためだけのDOMを残さない（送信時と保存時に自動で除く）。
- 取得に時間がかかるページは、`Utils.navigateSafely(page, url, selector, gotoTimeout, selectorTimeout)` の待ち時間を延ばしてよい。バッチ全体の上限は `CRAWL_LATEST_TIMEOUT_MS` / `--timeout-ms`。延ばした値と理由をコードコメントに残す。
- `--local-files` の子プロセスへAPI URL・APIトークン・DB接続文字列の秘密値を渡さない（空文字でdotenvの再読込みも防ぐ）。remote実行ではDOMと生結果をメモリに保持し、API側の非公開volumeだけへgzipを保存する。worker側へDOMを二重保存しない。
- DOMの保存期間は既定30日、`CRAWLER_ARTIFACT_RETENTION_DAYS` で1〜3650日に設定する。期限後はDOMだけを削除し、run・issue・hashは残す。`crawl:diagnostics:pull -- --resort <id>` はDOM取得不可のrunでも `run.json` を保存する。
- 雪マジも同じredaction・run/issue・gzip volume・診断取得を使う。`--resort yuki-magi` で取得できる。雪マジ施設は全件の取得・検証完了前にDB更新しない。

### 4. 検証する

1. 現行URLの検証は `mise run crawl:latest -- --remote-api --resort <resort-id>` で実行し、設定済みAPIへ保存する。`LINKED` では子IDごとに実行する。スキー場ID、名前、状態、件数、URL、`note`、`update`、警告をDOMと照合し、APIのrun・カテゴリ保存結果とadminが参照する現在値への反映まで確認する。さらに、親のコース・リフト合算と、子ごとのコンディションタブを確認する。検証目的という理由だけでAPI設定を空にしたり、ローカルJSON保存だけで完了したりしない。API設定不足・通信失敗は未完了として報告する。
2. オフシーズンまたは状態の意味が現行DOMだけで確定しない場合は、`CRAWL_LATEST_ARCHIVE_TIMESTAMP=YYYYMMDD` を使うなどして、同じクローラー経路を冬季アーカイブでも検証する。
3. 正常・無警告で診断DOMが増えないことと、未知状態・必須DOM消失・件数異常の各テストで警告、DOM、診断メタデータが同じ実行IDで残ることを確認する。
4. 対象ファイルをBiomeで検査し、`mise run typecheck` を実行する。

冬季アーカイブの再生は `--remote-api` でAPIへ保存する。`CRAWL_LATEST_ARCHIVE_TIMESTAMP` があるrunは `sourceMode: WAYBACK_VALIDATION` として記録され、`eligibleForCurrent` が `LIVE` を要求するので現在値には入らない。冬に何が掲載されるかは再取得しづらい情報なので、ローカルファイルに留めずサーバーに残す。

保存DOMの再生と異常注入だけは `--local-files` でAPI送信を無効化する。意図的に壊した結果を本番へ入れない。

ローカル保存を使う場合、アーカイブ結果を `latest_data/` へ書かない。`latest_data/` はGit管理下で、管理画面の名称対応が候補として読む。公開画面は使わない。アーカイブ実行の保存先は `tmp/wayback/<timestamp>/` に分かれている。ローカル実行（`--local-files`）で作られた `latest_data/` のファイルは、確認後に削除する。

ユーザーがローカル検証のみを指定した場合を除き、最後に現行URLのAPI保存と反映確認を行う。正常に保存された検証JSONは比較資料として残してよいが、API保存の代わりにはしない。不完全な失敗結果だけを削除してよい。

## 完了報告

最終回答に「状態・取得範囲の監査」を含め、簡潔に次を示す。

- 現行ページと冬季アーカイブの対象URL・日時、カテゴリ別・状態別件数、警告
- コース／リフトの各状態について、根拠と実際に変換経路へ通した結果
- 正常取得した空欄を `status: "×"` にした対象・件数とDOM取得成功の判定。空の営業項目一覧から固定在庫を補った場合は、その名称・件数の根拠
- 天気、気温、積雪、降雪、雪質、風速、コメント、各 `update` の取得可否と根拠
- 取得元（読んだ公式ページと、そこから読んだ埋め込み・部品）と出典URL・ラベルの対応、`commentUrl` を付けた根拠
- capability台帳の作成・更新結果（コース／リフトの件数・名称・出現した状態記号、コンディション各項目の可否、出典アーカイブ日時）
- 画像天気を使う場合は、調査した識別子と未知値警告のテスト結果
- 未確認の状態・カテゴリ、残したTODO、対応URLを残した／空にした理由、推測しなかった範囲
- 現行データのAPI保存結果（run ID・カテゴリ別の反映結果）、残した検証JSONパス、Biome・型チェックの結果
- `LINKED` では所属子IDごとの保存・反映結果、親のコース・リフト合算、コンディションタブの子別表示と未完了の子

単に「確認済み」とせず、何をどのDOM・凡例・アーカイブで確認し、何が未確認かを区別する。
