# 天気サイトのリンク

ゲレンデマップURL・SNSと同じく、本番DBの `data_documents` にある
`SkiResortLinks.json` 文書を正本にする。ローカル実行も
`DATA_API_BASE_URL` の設定時は本番の正本APIを使う。

スキー場ごとの `tenkijpUrls` / `snowForecastUrls` / `weathernewsUrls` は
他のリンクと同じ `{ url, description? }` の配列。`description` は地点名。
既存の関連URL管理画面、コース・リフト編集のリンク欄、関連URLの修正提案で扱う。
予報埋め込みの地点IDはURLから取り出す。ウェザーニュースは代表地点1件。
Windyは既存どおりスキー場の緯度・経度から生成する。

統合エリア自身に天気URLの項目があれば、その設定を優先する。
項目自体がなければ結合元の地点を集める。空配列を保存した場合は
意図した削除として扱い、結合元や旧JSONから復活させない。

既存の `src/private/data/SkiResortWeatherIds.json` は初回移行の入力のみ。
通常の画面表示やクローラーの同期では読まない。
初回DB作成の `importCanonicalDataDocuments.ts` でもリンク文書へ変換する。

稼働中のDBへの移行は次の順で行う。

```sh
node --import tsx scripts/migrateWeatherLinks.ts
node --import tsx scripts/migrateWeatherLinks.ts --apply
```

プレビュー・変更前の文書・変更後の文書は
`src/private/data/resorts-temporary/tmp/weather-links-db/` に保存される。
適用時は入力JSONと本番のハッシュがプレビューと一致することを確認し、
既存の天気項目（空配列も含む）と他の関連URLを保持する。再実行しても
既に設定された項目を上書きしない。

DBへの移行後、アプリとクローラーにもこの実装をデプロイする。
旧バージョンは天気JSONを読むため、DBの天気リンク編集はまだ表示へ反映されない。
