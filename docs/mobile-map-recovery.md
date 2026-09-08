# モバイル地図の復元と現在地

地図の選択・表示位置は操作時に端末へ保存し、Safari の休止やページ再読み込み後に復元する。営業状況に保存時刻の表示は追加しない。

## 状態保存

- `HomeClient` が選択中のスキー場、コース・リフト、検索条件、モバイルのタブとパネル状態を保存する。
- スキー場を示す `?resort=` を URL に保持する。別のスキー場への直接リンクを優先し、同じ URL の再読み込みでは元のタブを保持する。
- `MapLibreResortMap` がスキー場別に中心・倍率・回転・背景・色分け・営業中のみの設定を保存する。復元中の自動 fit と営業情報更新による再センタリングを抑える。
- `ResortMapSection` が全画面表示を保存する。全画面時は背後のプレビュー地図をアンマウントする。
- 保存内容はバージョン付きスキーマで検証する。保存禁止・容量超過でもオンライン操作は継続する。

## 復帰と現在地

`visibilitychange` / `pageshow` でサイズと描画を更新する。WebGL の喪失や復帰後の描画停止では地図を一度自動再生成し、繰り返す場合は「地図を再表示」を出す。通信完了を意味する `idle` をフリーズ判定には使わない。

現在地ボタンを押してから位置情報の許可を求め、現在位置と精度の円を表示する。継続取得はバックグラウンドで停止し、復帰時に新しく取得する。再読み込み後は位置情報の取得を勝手に再開しない。端末位置はサーバーへ送信しない（地図の中心位置は通常の表示状態として端末に保存される）。近くのスキー場は直線距離順の上位5件を表示する。

## オフライン

Service Worker は本番でのみ登録する。閲覧済みの画面起動資産、地理院タイル最大400枚、スキー場詳細最大20件を保存する。背景地図の全エリア・全倍率の事前ダウンロードではない。端末による保存データの削除や未閲覧範囲には対応できない。

管理画面、認証、API、Server Action、RSC は Service Worker のキャッシュ対象外。詳細データは IndexedDB の structured clone で Date を保持し、オンラインでは再取得する。

WebKit では module worker 内の追加 import がサーバー切断時に失敗したため、`scripts/copyMaplibreWorker.mjs` で依存を単一ファイルにまとめる。ビルド時に外部 import が残っていないことも検証する。MapLibre の更新などで同じ URL のワーカー内容を変更する際は、`public/map-sw.js` のキャッシュ接頭辞も更新する。

## 検証

- 単体テスト: `mise exec -- node --import tsx --test src/features/map/session/storage.test.ts src/features/map/session/offlineWorker.test.ts`
- 型チェックと変更ファイルの Biome チェック。
- 本番ビルド: Webpack で成功。Turbopack はこの実行環境のポート制限で失敗。
- Chromium / WebKit のモバイル幅で状態・コース選択・全画面復元、現在地と近隣検索を確認。
- Chromium で位置情報の拒否、バックグラウンド停止・復帰、保存禁止、WebGL 喪失からの再生成、完全オフラインの再読み込みを確認。
- WebKit で接続先サーバーを停止してから再読み込みし、コース描画・中心・倍率・回転の復元と JavaScript エラーがないことを確認。
- Playwright の `context.setOffline(true)` では WebKit の再読み込みが `WebKit encountered an internal error` で失敗する。通常のページ内 reload でも成功を確認できず、原因は断定していない。接続先サーバー停止による検証とは結果が異なるため、完全な圏外復帰の検証完了とは扱わない。
- 実機 iPhone の Safari / ホーム画面アプリでの画面ロック、OS による終了、圏外での冷起動は別途確認が必要。

ブラウザ検証スクリプト・画像は `src/private/data/resorts-temporary/tmp/map-resume/` に保存。
