# タブ単位の画面復元とオフライン地図

## 保存するもの

- `HomeClient` は選択中のスキー場・コース・リフト、標高グラフの選択点、検索条件と編集中の条件、地図／リスト、検索パネル、比較対象を `sessionStorage` に保存する。
- 詳細の主タブ、コース／リフトのサブタブ・一覧の絞り込み、SNS内の選択、料金計算入力、地図／公式マップの切り替え、拡大表示、主要なスクロール位置も同じタブに保存する。
- MapLibreの中心・倍率・回転・背景・色分け・営業中のみの設定を保存する。背後の地図と拡大地図は別のキーを使い、互いに位置を書き換えない。既存の小さいプレビューはスキー場全体を北向きで表示する仕様を保つ。
- 一覧を再現する実データは、IndexedDB `rusutsu-offline-v1` の `views` ストアへタブ別に保存する。別タブがHTMLを更新しても、元のタブは元の一覧を復元する。
- 詳細は既存の `details` ストアへ一括保存する。`getSkiResortById` の戻り値全体なので、コース／リフトの全形状・属性・営業状況、基本情報、料金計算用の全シーズンデータ、コメント、サイトが保持する気象情報などを含む。DateはIndexedDBのstructured cloneで保持する。
- 今の公開画面の料金・ゲレンデ等のタブは静的importで、タブ選択後の追加データ取得を必要としない。遅延importされるMapLibreは詳細を開いた時点でも明示的に読み込み、JS/CSSと単一ファイル化したworkerをCache Storageへ保存する。
- 起動HTMLには公開の一覧データも含まれる。Service Workerは保存済みHTMLを通信待ちなしに返し、新しいHTMLの起動資産がそろった時だけ次回用のHTMLを更新する。

保存は操作時・データ取得時に行う。通信状態は画面状態の保存条件にしない。圏外でタブを変更・地図を移動した後も、次の再読み込みに反映する。

## 新規タブと同じタブ

初回のナビゲーション種別が `navigate` なら、この画面のsessionStorageだけを初期化する。これにより `window.open` などでopenerからsessionStorageが複製された場合も、別タブの選択を引き継がない。`reload` と `back_forward` は既存の保存を使う。メモリに残ったページへの復帰では初期化を再実行しない。保存に時間制限は設けない。

新規トップの地図は既存の `INITIAL_CENTER` とモバイル／デスクトップの初期倍率を使う。ホームボタンの仕様は変更しない。`?resort=` は保存内容より優先し、新しい行き先ではコース選択を引き継がず、通常のスキー場選択と同じ詳細パネルを開く。

ブラウザの「タブを復元」などで、sessionStorageやナビゲーション種別をブラウザ自体が保持しなかった場合までは識別できない。

## 背景地図の範囲と上限

`tilePlan.ts` が対象スキー場の**全コースと全リフト**の座標から外接範囲を作る。形状がなければスキー場の位置を使う。

- 背景は地理院の淡色地図 `pale` と航空写真 `seamlessphoto` の2種類。
- 最低倍率は形状全体が約180pxに入るXYZズームから求める（5〜16）。小さいプレビューを含む。
- 最高倍率はXYZの16、端末の画素密度が1を超える場合は17。MapLibreの表示倍率は256pxタイルとの換算で通常これより1小さい。
- 各倍率で、スキー場の外接範囲の四方に**全画面の対角線の半分**に相当する距離を追加する。画面寸法はブラウザ表示領域と端末screenの大きい方を使う。小さいプレビューから全画面に変えた場合や地図を回転した場合の周囲を含む。
- この範囲内の各倍率で操作できる原寸タイルを保存する。プレビュー画像を引き伸ばす方式ではない。範囲外のパンや未保存倍率は保証しない。
- 1スキー場の先読みは最大3,200枚。先読み通信は全ジョブ合計で2件まで。通常の表示に必要な通信は別に優先する。
- 共有タイルキャッシュは最大6,000枚／192MiB。起動資産は600件／64MiB、公式マップ画像は120件／64MiB。CORSで内容を読めない画像は1枚7MiBとして保守的に計上する。PDFは外部リンクのまま。
- 同じURLが保存済みなら再取得しない。別の画面を選んだタブの先読みは打ち切る。

ルスツの現在の形状を390×844・DPR 2で計算した計画は約2,650枚、XYZ 11〜17。実際の枚数は形状・画面サイズに依存する。上限を超える計画を切り詰めて「完了」とは報告しない。

地理院タイルの出典表示を維持する。利用条件は[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)、方式は[公式仕様](https://maps.gsi.go.jp/development/siyou.html)を参照。全国や全倍率の一括ダウンロードは行わない。

## 中断・更新・削除

`rusutsu-map-v1-meta` キャッシュのスキー場別レコードに `saving` / `complete` / `partial` / `failed` を記録する。容量上限、途中の通信失敗、起動HTMLの未保存を完了扱いしない。ブラウザ終了中のジョブは完了扱いにならず、次にオンラインで詳細を取得した際に不足分を補う。再接続時にはHTML・起動資産も再試行する。

各タブで直近の異なる2スキー場（現在と1つ前）を保持する。ホームは履歴に数えない。A→ホーム→B→ホーム→Cなら、Cを開いた時点でAの画面状態を削除する。再訪は最新へ移し、同じスキー場やホームへの再読み込みでは履歴を消費しない。

詳細データはIndexedDBの一覧スナップショットにタブごとの参照IDを記録し、参照更新と削除を同一トランザクションで行う。他タブがAを保持していれば共有データを残す。遅れて完了した古い取得は保存しない。比較表示だけの取得は保存履歴に加えない。詳細と一覧スナップショットの各20件という全体上限は、複数タブでの容量保護として残す。

Service Workerもタブごとの2件と、各スキー場が所有するタイル・公式マップ画像を永続化する。古い保存ジョブが終了してから、どのタブも保持していないスキー場のメタデータと専用画像を削除する。別の保持対象と共通の画像は残す。再保存で画像範囲が変わっても所有URLを引き継ぎ、後でまとめて回収できる。一覧背景は詳細と別の512枚の保存枠とし、詳細の閲覧履歴には含めない。起動HTML・共通JS/CSSもスキー場の削除対象外。

容量上限や保存禁止でもオンライン表示を続ける。移動先の保存に失敗した場合でも1つ前のスキー場は残るが、2つ前は要求どおり保持対象から外す。

- 旧localStorageの `rusutsu:home:v1`、`map:v1:*`、`expanded:v1:*` と今回の画面用キーだけを起動時に削除する。新たな画面状態はlocalStorageへ書かない。
- sessionStorageはタブを閉じるとブラウザが破棄し、新規ナビゲーション時にも当該画面のキーを初期化する。編集画面の下書き等は触らない。
- タブの閉鎖とOSによる休止は安全に区別できないため、時間切れや`pagehide`による他タブの参照削除はしない。閉じたタブの参照や旧版の所有情報のないデータは保守的に残り得る。全体の容量上限は継続し、ブラウザによるサイトデータ削除・容量回収の対象にもなる。

API全般、認証、管理画面、Server ActionのPOST、RSC応答はService Workerのキャッシュ対象外。公開HTMLや先読み画像の取得には資格情報を付けない。外部SNS・SnowForecastの埋め込みは保証対象外で、それらの失敗を地図・サイト内情報の表示条件にしない。

## 復帰・現在地

既存の `visibilitychange` / `pageshow` によるサイズ・描画更新と `useMapRecovery` を継続利用する。WebGL喪失では自動再生成し、通常復帰で再読み込みを求めない。営業情報の更新で保存位置を再フィットしない。

現在地の取得開始・バックグラウンド停止・再開の仕様は変更しない。再読み込みによって位置情報を勝手に取得しない。

## 検証

保存・タイル計画・Service Workerの単体テスト:

```sh
mise exec -- node --import tsx --test src/features/map/session/*.test.ts src/features/map/utils/*.test.ts
mise run typecheck
```

本番ビルドとブラウザ検証では `DISABLE_CRAWLER_SCHEDULER=true` を指定してローカルサーバーを使う。開発モードではService Workerを登録しない。

検証用スクリプトと画面画像は `src/private/data/resorts-temporary/tmp/tab-offline/`、ログは `src/private/data/resorts-temporary/logs/offline-*.log` に保存する。

2026-09-18の実行結果:

- 地図関連の単体テスト53件は成功。途中失敗と不足分の再取得、不完全な新版HTMLで旧版を置換しないことも含む。
- 本番Webpackビルド成功。変更ファイルのBiomeと差分の空白チェック成功。
- Chromiumで新規トップの中心・倍率、検索条件、リスト表示を実タイルで操作し、完全オフラインで再読み込みして復元した。
- `window.open`によるsessionStorageの複製でも新規タブを初期化し、元タブと編集用下書きを保持、旧画面用localStorageだけ削除できた。
- 詳細の受け入れ試験は有効なPNGのテストタイルを使った。新しいブラウザコンテキストで詳細だけを開き、約2,650枚の自動保存完了後にテスト用のネットワーク応答を解除し、`context.setOffline(true)`でサーバーと外部通信を遮断した。未表示の料金・天気、初回拡大、拡大状態と中心・倍率・回転、圏外での再操作、コース選択の再読み込み、詳細への復帰、再接続後の選択維持を確認。保存計画のXYZ 11〜17で失敗したタイル要求がないことも検査する。MapLibreが補助的に要求する計画外の低倍率の親タイルは対象外。
- 実際の地理院タイルだけによる詳細の全量保存は、約1,100枚の段階で配信タイムアウトになった。失敗状態と取得済みキャッシュの保持は確認したが、**実配信による全量保存後の拡大背景の画質・連続性は未検証**。テスト画像による復元試験と混同しない。
- 全体テストの実行時は497件中493件成功、4件失敗。失敗は同時に変更されているConditionTable・CourseStatusTableの表示仕様の期待値に関するもの。
- 通常の型チェックは途中で成功したが、最終確認時には別作業の `src/private/data/resorts-temporary/tmp/comment-tabs/ui-fixture.tsx` に古いpropsのエラーがあった。一時作業ディレクトリを除外した型チェックは成功した。

再実行用のブラウザテスト:

```sh
mise exec -- node scripts/testOfflineOverview.mjs
# 実配信。外部サイトの速度・稼働状況に依存する。
mise exec -- node scripts/testOfflineDetail.mjs
# 配信の不安定さを分離する再現テスト。地理的な画像内容は検証しない。
OFFLINE_TEST_FIXTURE_TILES=1 mise exec -- node scripts/testOfflineDetail.mjs
```

既定URLは `http://localhost:3001/rusutsu`。`OFFLINE_TEST_URL` で変更できる。各実行は空のキャッシュで始める。実機iPhoneの画面ロック、OSによるページ破棄・タブの再生成、ブラウザの容量回収は、自動ブラウザのオフライン再読み込みとは別の実機確認が必要。


## 今回の変更ファイル

- `src/features/home/HomeClient.tsx`: タブの初期化、一覧スナップショット、圏外取得、詳細の自動保存、検索・比較状態。
- `src/features/home/layout/HomeLayout.tsx`: デスクトップ地図の拡大状態。
- `src/features/home/components/MobileResultsSheet.tsx`、`SkiResortList.tsx`: 主要なスクロール領域の識別。
- `src/features/map/MapLibreResortMap.tsx`: 拡大地図の保存先を分離し、別スキー場への選択変更時に古い復元位置を適用しない。
- `src/features/map/session/storage.ts`、`useScreenState.ts`、`useScrollSession.ts`: タブ別の保存スキーマ、操作時の保存、スクロール復元。
- `src/features/map/session/detailCache.ts`: IndexedDBの一覧スナップショットと既存データを守る容量制限。
- `src/features/map/session/tilePlan.ts`、`prepareDetail.ts`: スキー場形状・画面サイズからの先読み計画と自動保存開始。
- `src/features/map/session/MapSessionProvider.tsx`、`useOfflineMap.ts`: 復元フックと再接続時の起動資産補完。
- `src/features/resort-detail/SkiResortDetailView.tsx`: 詳細タブ・選択元・表示状態の復元。
- `src/features/resort-detail/tabs/CoursesTab.tsx`、`LiftsTab.tsx`、`OverviewTab.tsx`、`TicketsTab.tsx` と `src/features/lift-ticket/components/LiftTicketCalculator.tsx`: 一覧の絞り込み、SNS内の選択、料金入力の保存。
- `public/map-sw.js`: 起動HTML、資産、背景、公式マップ画像の保存、容量・同時通信制限、保存状態、失敗時の既存キャッシュ保持。
- `src/features/map/session/*.test.ts` と `scripts/testOfflineDetail.mjs`、`scripts/testOfflineOverview.mjs`: 単体テストと空のキャッシュから行う本番ブラウザ検証。

既存の編集途中のUI変更は残している。上記一覧はこの復元対応で触ったファイルであり、作業ツリー全体の差分をすべて今回追加したという意味ではない。


### 直近2件の保持ルールの追加検証

- `mise exec -- node --import tsx --test src/features/map/session/*.test.ts`: ホーム経由の履歴、他タブの保護、共有タイルの保護、古い保存処理による復活防止、25件巡回を検証。
- `mise exec -- node scripts/testOfflineRetention.mjs`: 実ChromiumのsessionStorage / IndexedDBでAの画面状態削除、B・Cの再読み込み、別タブがAを手放した後の削除、25件巡回、再訪、編集下書きの保護を確認。ネットワーク配信はローカルのテストHTMLで代替し、保存処理は本番モジュールを実行する。
