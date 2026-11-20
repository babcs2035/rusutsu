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

- 配備の契約試験は，既存の Compose project，DB volume，DB の接続設定と OAuth 設定を引き継ぐことを確認する．設定の値にドル記号や引用符を含む場合も，Compose に同じ値が渡ることを検査する．
- 接続確認，必須のバックアップ，migration，readiness の失敗時は，後続 step または成功記録の更新を止める．画像の削除候補から現在版，直前の正常版，コンテナ参照中の画像，DB と別プロジェクトの画像を除外する．
- 保存試験は `DEPLOY_TARGET/backups` の権限，チェックサム，最新 7 世代の選択，容量不足，破損，symlink，操作の排他を確認する．

## Docker と PostgreSQL で復元を確認する

Node.js と `pg` を含む検証対象のローカルイメージを指定する．VPS に Python を導入する必要はない．

```sh
uv run --no-project scripts/ops/verify-local-backup.py --image rusutsu:test
```

この試験は専用の PostgreSQL コンテナで人工の施設，文書，ユーザー，認証アカウント，写真，申請，クロール現在値を作成する．元の行と復元後の値を照合し，旧保存先のコピーが実際に復元できてから削除されること，破損した世代を拒否することを確認する．試験は自分が作成したコンテナと一時ファイルを片付ける．

## 本番配備で確認する項目

- GitHub の Secrets と Variables，VPS の SSH/Docker 権限，Cloudflare Tunnel の到達経路を確認する．
- readiness，Google OAuth，管理画面の権限，公開画面，地図と外部埋め込みを確認する．CSP の違反を観測し，必要な通信を確認してから適用する．
- 配備後のイメージ整理と 03:00 JST の日次バックアップの結果を確認する．手動の `test_restore` で，保持された世代の復元を確認する．
