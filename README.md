# Rusutsu

日本全国のスキー場の地図・営業状況・天気・料金を検索し，比較するアプリケーションである．Next.js と PostgreSQL を使い，管理画面では地図・施設情報を編集し，投稿や情報修正の申請を審査する．

## ローカルで起動する

Git，mise，Docker Compose と，非公開サブモジュール `src/private` の読み取り権限が必要である．

```sh
git clone --recurse-submodules git@github.com:babcs2035/rusutsu.git
cd rusutsu
mise install
mise run setup
mise run dev
```

公開画面は [http://localhost:3000/rusutsu](http://localhost:3000/rusutsu)，管理画面は同じ URL の `/admin` にある．環境変数の見本は [.env.example](.env.example) を参照する．setup で開発用 PostgreSQL と Prisma を準備する．スキー場のデータが必要な場合は，正本 API への接続やバックアップの復元の手順を運用文書で確認する．

検証には `mise run check` と `mise run test` を使う．テスト用 DB の準備と個別試験の指定方法は [テストの実行](docs/d0020_testing.md) を参照する．コマンドの一覧は `mise tasks` で確認できる．

## 文書

| 作業 | 参照先 |
| --- | --- |
| サーバーと正本の構成を調べる | [データ管理と内部 API](docs/d0001_backend-data-architecture.md)，[コース・リフトの正本](docs/d0002_canonical-map-storage.md) |
| 配備する，または VPS から DB をエクスポートする | [運用手順](docs/d0005_backend-migration-runbook.md)，[配備とエクスポートの検証](docs/d0006_backend-deployment-verification.md) |
| データを収集し，公開する | [営業状況の採用条件](docs/d0012_crawler-operation-coverage.md)，[更新日時](docs/d0013_crawler-published-times.md)，[公開手順](docs/d0008_content-publishing-guide.md) |
| 編集者の権限や投稿を扱う | [編集と承認](docs/d0007_editor-approval-workflow.md)，[現地レポートと情報修正](docs/d0009_user-contributions.md) |
| 画面や地図を変更する | [UI 指針](docs/d0010_ui-guidelines.md)，[画面の復元とオフライン地図](docs/d0011_mobile-map-recovery.md)，[天気リンク](docs/d0014_weather-links.md) |
| 料金や推薦の仕様を調べる | [料金の期待値](docs/d0015_lift-ticket-duration-test-cases.md)，[コース推薦](src/features/course-recommendations/README.md) |
