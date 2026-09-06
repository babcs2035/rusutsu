# バックエンド移行のローカル検証記録（2026-09-05）

**この記録は外部バックアップ案を含む旧版の検証履歴です。** その後のユーザー指示で外部保存を廃止し、
GitHub設定の自動反映とVPS内コピーへ変更しました。現在の手順は[操作手順書](backend-migration-beginner-guide.md)、
変更後の検証は[配備処理の検証記録](backend-deployment-verification.md)を参照してください。

本番未導入。commit、push、deploy、本番DB/APIアクセス、公式サイト・Waybackへのlive crawlは行っていない。
既存の未コミット差分を親・submodule双方で監査し、GeoJSONの既存変更・削除を保全した。
全国93件のlive結果（70正常・21警告・2失敗）は別の過去記録であり、今回再実行した結果ではない。

## 実施結果

| 検証 | 結果 |
| --- | --- |
| `mise run test` | 52 test files / 334 tests成功、失敗・skip 0 |
| クローラーtargeted tests | 81成功（上の全testに含む） |
| backup/deploy/Compose tests | 25成功（同上）。外部コマンドはstub、Compose解析は実CLI |
| `mise run typecheck` | 成功 |
| `pnpm biome ci src scripts` | 527ファイル成功、書換えなし |
| 親/submodule `git diff --check` | 成功 |
| `mise run build` | hostのTurbopack内部ポート作成がEPERMで停止 |
| `mise run build -- --webpack` | 最終コードで成功（再build 13.6秒） |
| `docker compose config --quiet` | 成功。ローカルの未設定scope tokenについて警告あり |
| production Compose | 必須10変数を1個ずつ除いた拒否試験、token分離、DB/API health待機を確認 |
| migration全適用 | 空の専用DBへ過去を含む13本を適用し成功 |
| 既存DB相当からの移行 | 過去8本→人工マスター114件→新5本。114件と既存列を保持、isActive既定true |
| schema/SQL整合 | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` で差分なし |
| 文書import dry-run | 1,962件、JSON/GeoJSON構造・キー・UTF-8サイズ・hash等の検証成功。DB接続なし |
| 短縮名import dry-run | 113件、形式・重複・長さ・ID検証成功。DB接続なし |
| 実DB初回import | 1,962文書と113短縮名を専用DBへ投入し成功 |
| 削除後の再投入防止 | 移行完了後に1文書削除＋1短縮名NULL化→両import再実行はalready_completed、値は復活しない |
| crawler自動列挙 | 93件。template/before/test除外 |
| 本番用Docker image build | 実行したが完了せず。Docker領域100%（残り4.9MB）、apt署名検証エラーで停止 |

Dockerの署名検証を無効にする回避は行っていない。今回のbuildで新規作成されたことを
作成日時・IDで確認した15キャッシュだけを指定して整理し、空き容量を回復した。
既存イメージ・コンテナ・volume・過去キャッシュは削除していない。
Docker最終imageへの全ファイル組込み・最終RUNのdry-run・image起動の確認は未完了。
CIでの実buildか、十分なDockerディスク容量を用意した環境で再検証する。

## 実HTTP・ブラウザー試験

価値のある既存ローカルDBをresetせず、専用PostgreSQL16コンテナを作成。
DBは `audit_fresh` / `audit_existing`、接続は127.0.0.1:55432、データ領域はtmpfs。
運用DB・既存volumeを使用していない。人工マスター114件と既存Gitの移行fixtureを使った。
検証後は今回起動した3100〜3102番のサーバーと専用DBコンテナを片付けた。

3000番は既存サーバーが使用中だったため、検証用に3100〜3102番へ分離した。
すべてNext.jsのbase path `/rusutsu` を使用した。

- 3100: 最終production buildが専用DBを直接読む構成。
- 3101: 運用マスター0件の別専用DBを持ち、サーバーから3100の内部APIを呼ぶ構成。
- 3102: 内部APIトークンをすべて未設定にして専用DBを直接読む構成。

3構成ともPlaywrightで公開ページ200・114件表示、page error 0。
各32レスポンスを確認し、ダミー内部tokenがブラウザーのリクエスト・本文へ混入しないこと、
ブラウザーから管理用内部APIを直接呼ばないことを検証した。
`.next/static`にも3つのダミーtoken、scope token環境変数名、旧短縮名JSON importは含まれなかった。
外部タイル等の通信は遮断したため、外部地図・OAuthの実動作確認にはならない。

`scripts/auditBackendHttp.mjs` はloopback URLと `AUDIT_DISPOSABLE_DB=true` を要求する。
人工 `audit-resort` がある使い捨てDB専用で、運用DBには実行しない。
実HTTPによる17チェックが最終buildで成功した。

- tokenなし401、別scope403、path traversal400、不正JSON400、内容不正422、大きすぎる本文413。
- 同じupdatedAtでスキー場を同時更新し、1件200、1件409。非公開時の一覧除外とadminでの再公開。
- 同じhashで文書を同時更新し、1件200、1件409。文書versionは2。
- レスポンスに内部tokenがない。
- 別途、token未設定サーバーはreadiness200、保護API503を確認。公開画面は正常表示。

実Googleログインを使う複数管理者の操作は未実施。Server Actionsの各認可確認と内部APIの
実同時更新は検証したが、本番OAuth・ユーザーrole設定の受入試験は本番導入後に必要。

## クローラーの実PostgreSQL統合試験

公式取得はmockし、最終ソースの保存処理とroute handlerを専用DBで実行した。
古いビルドのHTTPサーバーには依存しない。

1. 正常4カテゴリを現在値へ昇格。
2. 次回LIFTSの未知状態をserverで検出し、前回リフト値を保持。正常COURSESだけ更新。
3. Waybackのsnapshotは保存し、LIVE現在値は不変。
4. 同一payload再送は同じrunを返し、新規作成なし。別payload同一keyはrouteで409。
5. redaction後DOMをgzip保存しhash照合。診断routeはtokenなし401、別scope403、diagnostics200。
6. ページ生成前のYuki失敗は施設FKなしのrunとなり、snapshot/currentを作らず診断取得可能。
7. Yuki詳細取得の一部失敗で実DBの既存Yuki行が完全不変。診断保存→browser終了の順序と秘密値除去を確認。

unit testsでは加えて、local-files子processからAPI環境変数除去、正常無警告DOM不保存、
未知状態・selector消失・重複・空名・件数異常、起動失敗run、remote二重保存防止、DOM保存期間を検証。

## 監査で修正した主な問題

- 起動時の自動import、DB欠損時のGit文書・過去latest JSON fallbackを通常運用から除去。
- 短縮名をDB列・admin・API・公開projectionへ移し、クライアントJSON importを除去。
- 旧共通tokenの複数scope互換を廃止。scope違いを403、重複token設定を503で拒否。
- request.text/jsonで全体をメモリへ読んでから制限していた箇所を、ストリーム中のサイズ制限へ変更。
- 料金・詳細の暗黙の全フィールド公開を明示projectionへ変更。旧weather raw読取Actionは管理者限定。
- global errorによる無関係カテゴリ停止、page作成前失敗の診断欠落、DOM二重保存・初期化順序・保持期限を修正。
- Yuki診断を共通run/issues/gzip/診断APIへ統合し、失敗時DB不変を検証。
- 配備前backup、独立日次backup、readiness、明示scheduler有効化、schema/SQL漏れ検出を追加。

`crawl_element`の実コード参照は見つからず、既存削除を維持。
submoduleの5本の新crawlerは未追跡のまま保全し、最終Docker buildのファイル検査へ追加した。
commit・pushするまではGitHub Actionsへ渡らない。

## 未実施と次の確認

- 本番へのmigration・初回import・段階crawl・admin受入試験、友人VPSへのアクセス。
- 実age/rcloneと実際のVPS外保存先を使った暗号化・転送・再照合・実復元。
  外部コマンドの失敗経路はstubで確認済み。保存先と復号鍵の保管場所は未決定。
- 完成したproduction Docker imageのbuild・起動。Docker容量確保後の再確認が必要。
- 現行公式・冬季Waybackのlive確認。既存9月監査の警告を推測で消していない。
- メール通知、文書本文・編集者の完全な変更履歴、DOM volume全体の自動外部backup。

具体的な本人・VPS管理者の作業、初回deploy順、初回flag解除とcommit順は
[運用手順書](backend-migration-runbook.md) にまとめた。

一時ログは `/private/tmp/rusutsu-final-tests-20260905.log`、
`/private/tmp/rusutsu-final-build-20260905.log`、
`/private/tmp/rusutsu-docker-build-20260905.log`、
`/private/tmp/rusutsu-persistence-audit.log`、
`/private/tmp/rusutsu-yuki-persistence-audit.log`。
これらはOSによって消える可能性があるため、この記録を永続的な結果の要約とする。
