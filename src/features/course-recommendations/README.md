# お気に入りとコース推薦

お気に入りの状態は `features/favorites/FavoritesProvider.tsx` に集約する。ブラウザ保存は `rusutsu:favorites:v1`。ログイン後は `Favorite` のユーザー・スキー場複合主キーが正本になり、ゲスト保存を重複なしでマージしてからゲストIDを消費する。アカウントのIDやお気に入りをブラウザ保存へコピーしない。

Google認証は既存Auth.js設定を利用する。初回の自動追加は15分のHttpOnly操作Cookieと、成功したサインイン時にJWTへ記録したnonceの一致を条件にする。キャンセルや過去のセッションでは追加しない。復帰URLのマーカーは既存の地図・検索・比較・コース選択のsessionStorageを保持するために使い、起動後に除去する。

ログイン履歴Cookieは認証Cookieと独立したHttpOnly・SameSite=LaxのファーストパーティCookieで、ログイン済みだった事実だけを記録する。有効期間365日はこの履歴にだけ適用し、Auth.jsのJWTは従来どおり30日。Auth.js `/api/auth/session` は成功時にJWTとCookieの30日の有効期限を更新する。SessionProviderは5分ごと・フォーカス時に状態を再確認する。「あとで」は閲覧タブ内で保持し、明示ログアウトはAuth.jsのsignOutイベントでも履歴を消す。

## 抽出と計算

- `groupKind: routes` は `routeKey` の末尾 `:route:<整数>` を数値として解析し、グループの最小番号だけ採用する。番号・グルーピングが不正な場合は除外。検索元でも非メインルートからメインルートへフォールバックしない。
- 連続区間は `sectionOrder`、または既存の上部・中部・下部の名称順で接続する。同順序、順序不明、15mを超える接続間隔、接続点で5mを超える標高差は除外する。
- 元の名称・内部名称・グループ表示名を確認し、空、名前不明、名称不明、無名および無名の内部識別名を除外する。
- 全座標・全標高が有限値であることを要求する。欠損を補間して救済せず、100mを超える疎な線分も除外する。正規化時に失われた不正座標もフラグで保持する。40m未満の短い線は特徴量の信頼性が低いため除外する。
- 10mの水平距離ごとに再サンプルし、既存 `calculateCoordinateSlopes` の前後2点（約40m）で斜度を平滑化。3°の16区分、負の斜度は最初、45°以上は最後。水平距離と標高差から求める斜面距離でヒストグラムを加重し、同じ斜面距離の合計を距離比較に使う。公式距離は推薦計算に使わない。
- 圧雪○と非圧雪×だけを相互除外する。混在または△があればpartial。未取得区間があり全体を断定できないときはunknown。
- カーブは距離ベースの前後50mから45°以上の方向変化を検出し、75m以内の検出を集約する。3回以上かつ2回/km以上でwinding。normal/windingは別候補群で、スコアには加算しない。
- Wasserstein距離は累積分布差の15区間だけを3°で積分し、最後の45°以上の無限幅を加えない。差を18°で正規化し、距離差は `abs(log(LA/LB))/log(3)`。斜度65%、距離35%。75点以上の上位3件をID順の安定した同点処理で返す。
- 統合・連携エリアのデータIDと結合元の重なりを除外し、座標形状の指紋で自己推薦・同一形状の重複も除外する。

定数は `algorithm.ts` の `RECOMMENDATION` へ集約。変更時は計算versionを更新して全件を再作成する。

## DBと更新

`20261006000000_favorites_course_recommendations` が `favorites` と `course_recommendation_features` を作成する。後者はGeoJSON上のIDを保持するため、クロール基本情報の `Course` のIDには依存しない。

初回反映は接続先を確認してからマイグレーションと特徴量作成を行う。

```sh
pnpm prisma migrate deploy
mise run recommendations:rebuild
mise run recommendations:rebuild -- --apply
# 一つだけ再作成する場合
mise run recommendations:rebuild -- --apply --resort=furano
```

`DATA_API_BASE_URL` を設定していても、再計算コマンドの接続先は `DATABASE_URL`。本番の正本DB側で実行する必要がある。以後はcanonical DataDocumentのコース形状・区間情報・基本情報の書き込みと同じトランザクションで再作成する。統合で生成する文書も同様。リクエスト時は現在の計算versionを持つ、お気に入り候補の特徴量だけを取得し、全GeoJSONを読み込まない。ローカルのremote data API構成では既存のadmin-data内部APIで正本側へ推薦検索を転送する。

## 検証

`mise run test`、`mise run typecheck`、Biomeとビルドを使用する。`actions.integration.test.ts` は `FAVORITES_TEST_DATABASE_URL` があるときだけ、migrate済みの専用ローカルDB `rusutsu_favorites_test_<数字>` で実行する。実際のactionとrepositoryを使用し、認証済みIDとNextのリクエストCookieだけを隔離する。通常のテスト実行ではこのDB統合テストをスキップする。

実データの初期確認: 開発DBで99スキー場・1,597コースを抽出。富良野D3（約567m、距離加重平均13.2°）から湯沢中里パラレル（約590m、12.0°）、白馬五竜パウダースノー（約616m、12.7°）が上位に入った。標高・グルーピング品質の制限で推薦対象がないスキー場もある。Google提供画面での実アカウントによるOAuth往復は別途確認が必要。

最終検証: 通常テスト1,070件成功（DBを必要とする2件は通常実行ではスキップ）、新機能の隔離PostgreSQL統合テストは別途成功。Playwrightで初回／継続保存、再読み込み、PC・スマホ間のDB同期、アカウント分離、30日のCookie更新、ログイン切れ通知の抑制、明示ログアウト、通常比較セットの置き換え、320px幅で比較対象0件からお気に入り比較を開く操作、実推薦先へのコース・地図選択の引き継ぎを確認。型チェック・Biome・Webpack本番ビルドも成功。Turbopackは検証環境でビルド用ポートを作成できなかったためWebpackを使用した。

本番へのコード／DB反映は行っていない。本番正本APIを読む開発構成では、そのAPI側にも本変更・マイグレーション・事前計算が必要。ローカル検証は `DATA_API_BASE_URL` を空にして開発DBのデータで実施し、終了後に既存 `.env.local` を復元済み。
