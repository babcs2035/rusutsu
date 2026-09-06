# GitHub設定・VPS内コピーへの変更：検証記録

対象：外部バックアップを廃止し、GitHub Secrets/Variablesから既存VPSの設定を引き継ぐ改修。
本番へのpush、deploy、GitHubの実Secrets変更、本番DB/APIアクセス、live crawlは行っていない。
親・submoduleの既存変更を保全し、この改修ではsubmoduleのファイルを編集していない。

## 変更したこと

- 外部保存先、age、rclone、暗号鍵、手動の`/etc/rusutsu`設定への依存を削除。
- 必須の3つのAPI Secretsを検証し、マスク対象のBase64 JSONとしてSSH環境変数へ渡す。
- 本番URLをVariableから指定できるようにし、未指定なら既存AUTH_URLから取得。
- OAuth/管理者設定は既存値を維持し、任意の同名Secretが指定された項目だけ更新。
- 稼働コンテナのDB接続・project・実volume名・ポートを確認し、Git管理外へ設定を自動生成。
- 既存DBをexternal volumeとして明示。DBを検出できない場合や接続が合わない場合は停止。
- DB変更前・日次のコピーを同じVPSのSSHユーザーのホーム内へ保存。
- バックアップと配備をGitHub concurrencyとDockerの期限付きロックで排他。
- 手動`test_restore`で、同じVPS内の使い捨てDBへ復元する処理を追加。
- 初心者向けの[操作手順書](backend-migration-beginner-guide.md)と[仕組みの解説書](backend-migration-explained.md)を作成。
- README、運用手順、設計資料を新しい方針へ更新。旧検証記録は過去版であることを明記。

## ローカル検証

- 全体テスト：`mise run test`、355件成功、失敗・skipともに0。
- 型チェック：`mise run typecheck`成功。
- Biome：`biome ci src scripts`、536ファイル成功。
- Bashの構文検査：common / deploy / backup / restore各スクリプト成功。
- GitHub workflows：YAMLとしての構文確認成功。
- 親とsubmoduleの`git diff --check`成功。

配備・設定・コピーの単体/契約テストでは次を確認した。

- 既存project・volume・DB認証・ポート・OAuth設定を引き継ぐ。
- 任意のGitHub設定だけを更新し、指定のない項目を維持する。
- 弱い/重複したAPIキー、無効なURL、DBの不一致、未知の保存方式を拒否する。
- 設定の値に引用符、ドル記号、シェル展開の文字列が含まれても、コマンドとして実行しない。
- Composeにも環境変数の値をそのまま渡し、dotenvとして再解釈しない。
- GitHubの設定ペイロードをマスクし、失敗時にも秘密値を表示しない。
- 接続確認・DBコピー・archive検証の失敗では、app停止やmigrationへ進まない。
- 変更対象のない配備ではコピーを省く一方、migration確認と公開URLの応答確認を実行する。
- 初回コピー→migration→文書/短縮名投入→起動の順番を維持する。
- migration/応答確認で失敗した場合は成功記録と正式設定を更新しない。
- 最新情報のスイッチがホストのCOMPOSE_PROFILESより優先する。
- コピーの構成・チェックサム・0600権限、保持数・保持日数、破損・symlinkの拒否。

単体/契約テスト中のDocker/DBコマンドはstubで、Nodeの設定生成・引用・hash処理は実処理を使用する。
Composeの構成確認は実Docker Compose CLIを使用した。

## 実Docker・PostgreSQLでの試験

再実行用のコード：`scripts/ops/verify-local-backup.py`。
ローカルに存在するNode入りアプリイメージを指定する。VPSでこの検証用Pythonを導入・実行する必要はない。

```bash
python3 scripts/ops/verify-local-backup.py --image rusutsu:test
```

今回は既存のローカル`rusutsu:test`をNode/pg実行環境として利用し、改修した補助スクリプトをマウントした。
これは最新の本番アプリ全体をDocker buildした試験ではない。
PostgreSQL 16の試験コンテナは固有名・ネットワーク分離・PGDATAがtmpfsで、既存DBやvolumeを使用していない。

1. ドル記号・引用符・バックスラッシュを含む設定が、実Composeコンテナへそのまま渡ることをhashで確認。
2. 新しい接続確認処理で、スキー場のある試験DBへ接続でき、不在DBは拒否されることを確認。
3. 実`pg_dump`、実`pg_restore --list`、Nodeのチェックサム計算・照合を確認。
4. コピーが非公開のローカルディレクトリにだけ残り、各ファイルの権限が0600であることを確認。
5. 実`pg_restore`でネットワークのない別のtmpfs PostgreSQLへ復元できることを確認。
6. スキー場2件と、手動編集を想定したJSON文書の内容が復元後も一致することを確認。
7. 同じprojectの操作中は別のコピー処理が拒否されることを確認。
8. コピーの破損を検出し、元の試験DBの2件が変わらないことを確認。

Composeの`config`出力では再読込用にドル記号が二重化されるため、出力文字列と実コンテナ値は分けて検証した。

試験後は、今回作成したコンテナと一時ファイルだけを削除した。既存volumeは変更・削除していない。

## 本番公開時に残る確認

- 実際のGitHub SecretsとSSH/Docker権限、ホームの書込権限、既存コンテナの状態。
- 新しいコードを含めた最終Dockerイメージの完成・起動。
  前回のフルbuildはDocker容量不足などで未完了。今回の確認でもDocker領域の空きは約2.3GBで、フルbuildを再実行していない。
  今回は補助スクリプトを実Docker上で検証した。最終イメージはCIのbuildとimage内の必須ファイル検査を通す必要がある。
- 本番HTTPSとGoogle OAuthでの実ログイン・admin保存・複数管理者の操作。
- 本番での初回取り込み、1件→少数件の取得、全件定期実行の結果。
- 本番VPS内での日次コピーと`test_restore`の実行。

外部ストレージや復号鍵の準備は、残作業に含まれない。

実行ログの一時保存先は`/private/tmp/rusutsu-settings-final-tests.log`。
OSによって消える可能性があるため、上記の記録を継続して参照する。
