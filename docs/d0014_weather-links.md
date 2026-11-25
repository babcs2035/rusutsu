# 天気サイトのリンク

ゲレンデマップ URL・SNS と同じく，本番 DB の `data_documents` にある
`SkiResortLinks.json` 文書を正本にする．ローカル実行も
`API_BASE_URL` の設定時は本番の正本 API を使う．

スキー場ごとの `tenkijpUrls` / `snowForecastUrls` / `weathernewsUrls` は
他のリンクと同じ `{ url, description? }` の配列．`description` は地点名．
既存の関連 URL 管理画面，コース・リフト編集のリンク欄，関連 URL の修正提案で扱う．
予報埋め込みの地点 ID は URL から取り出す．ウェザーニュースも複数地点を登録できる．
Windy は既存どおりスキー場の緯度・経度から生成する．

統合エリア自身に天気 URL の項目があれば，その設定を優先する．
項目自体がなければ結合元の地点を集める．空配列を保存した場合は
意図した削除として扱い，結合元や旧 JSON から復活させない．

既存の `src/private/data/SkiResortWeatherIds.json` は初回移行の入力のみ．
通常の画面表示やクローラーの同期では読まない．
初回 DB 作成の `importCanonicalDataDocuments.ts` でもリンク文書へ変換する．
