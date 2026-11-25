<!-- 配備・バックアップの検証方法と，本番で確認する項目をまとめる． -->
# 配備とバックアップの検証

通常の操作手順は[配備と復旧の手順](d0005_backend-migration-runbook.md)を参照する．配備前に，親リポジトリと private submodule の版が揃っていることを確認する．

## ローカルで確認する項目

```sh
mise run check
mise run test
mise run build
git diff --check
```

- 配備の契約試験は，既存の Compose project，DB volume，DB の接続設定と OAuth 設定を引き継ぐことを確認する．設定の値にドル記号や引用符を含む場合も，Compose に同じ値が渡ることを検査する．配備成功後のイメージ整理が `docker image prune --force` で行われることを確認する．
- 接続確認，必須のバックアップ，migration，readiness の失敗時は，後続 step または成功記録の更新を止める．画像の削除候補から現在版，直前の正常版，コンテナ参照中の画像，DB と別プロジェクトの画像を除外する．
- 保存試験は `DEPLOY_TARGET/backups` の権限，チェックサム，最新 7 世代の選択，容量不足，破損，symlink，操作の排他を確認する．旧世代移行は一世代ずつコピー・復元・削除し，復元後の必須テーブル，スキー場データ，外部キー制約を検証する．

## Docker と PostgreSQL で復元を確認する

検証対象の Rusutsu リリースイメージをローカルでビルドし，そのタグを指定する．CI はリリースイメージをレジストリへ送る前に，同じ試験を実行する．

```sh
uv run --no-project scripts/ops/verify-local-backup.py --image rusutsu:test
```

この試験は専用の PostgreSQL コンテナへ現行の migration を適用し，施設，文書，認証アカウント，写真，申請，クロール現在値の試験データを作成する．通常配備の DB コマンド前後と復元後で，全テーブルの行数・内容を同じ snapshot 内で照合する．文書の hash・version，JSON のキー順，ID，参照，NULL，写真の byte を含む．旧保存先のコピーは復元に成功した後で除去され，破損した世代は拒否されることも確認する．

## 本番配備で確認する項目

- GitHub の Secrets と Variables，VPS の SSH/Docker 権限，Cloudflare Tunnel の到達経路を確認する．
- アプリの公開ポートを loopback に限定し，正式ドメインからの HTTPS を Tunnel で受け付ける．`CONTRIBUTION_TRUST_PROXY` は入口ですべての `x-real-ip` を上書きし，その入口を経ずにリクエストが到達しない場合に有効にする．開発時の `*.trycloudflare.com` は本番の Server Actions の許可範囲から外す．
- readiness，Google OAuth，管理画面の権限，公開画面，地図と外部埋め込みを確認する．CI の隔離ビルドでは CSP を強制してブラウザー試験を実行する．実環境の Report-Only で必要な通信を確認してから GitHub Actions の Variable `RUSUTSU_CSP_ENFORCE` を `true` に設定し，再ビルド・配備する．公開応答の `Content-Security-Policy` と各機能の動作を確認する．
- 配備後のイメージ整理と 03:00 JST の日次バックアップの結果を確認する．手動の `test_restore` で，保持された世代の復元を確認する．
