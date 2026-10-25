# ユーザー投稿機能

2026-10-25 時点の実装と運用手順。既存の編集者向け申請とは入口を分け、匿名の情報修正には `EditRequest.kind = public-correction` を使う。公開投稿は独立した `CommunityPost` に保存する。

## 画面と保存先

| 機能 | 入口・実装 | 保存・審査 |
| --- | --- | --- |
| 匿名の修正提案 | 詳細の「情報を修正する」、`/corrections/[resortId]` | `EditRequest` / `EditRequestEvent`。承認前は正式データを変更しない |
| 基本情報・関連URL | 基本情報、`/corrections/[resortId]/links` | スキー場マスターまたは既存 `SkiResortLinks.json` 文書への項目単位CAS |
| コース・リフト情報、一括修正 | 修正トップから対象・項目を選択 | 変更なしの行を含めて送信し、審査時に変更なしと区別 |
| 位置・追加・削除、属性の区間設定 | 修正内の地図 | 元座標を保存。スナップ・線の統合なし。属性区間は0〜1の距離比率で別々に保存 |
| 料金・出典の報告 | 計算結果・価格セル・出典表記の操作 | 条件・結果・識別子を非公開添付。管理者が確認して元データを修正 |
| 管理者による調整・部分承認 | `/admin/corrections` | 提出内容・候補・実際の反映を分離。元データと申請版が変わっていれば拒否 |
| 公開投稿・コブ・人工アイテム | `/community/[resortId]`、詳細の「投稿」タブ、地図の「＋投稿」 | Googleログインと公開名設定後に即時公開 |
| 複数コースのレポート | 投稿画面でコースごとに確定、最後にまとめて送信 | コースごとに別行。トランザクションと送信キーで重複防止 |
| コメント・いいね・通報・通知 | 投稿詳細、ホームのアカウント | 投稿者の認可・版を検証。匿名通報可。通知はサイト内のみ |
| 公開名・履歴・削除 | `/profile/[id]`、`/account/community` | Google名・ニックネーム・匿名。メールと選択していない本名を公開しない |
| AI・管理者対応 | `/admin/community` | 永続キューで事後判定。古い版の判定は新しい編集に適用しない。停止は管理者だけ |

コース・スキー場の平均評価は、星のある公開レポートのうち利用者ごとに最新の1件を集計する。コブ・アイテムの追加報告は独立した履歴として残し、親投稿・親アカウント削除後も他人の報告を維持する。

公開地図では下部パネルの上に「営業中のみ」「投稿」「＋投稿」と地図の出典を独立した1行で配置する。パネル内は上段が凡例・フィルター、下段が難易度／斜度・背景・設定。営業中のみONではコース凡例を○・△・不明の選択へ置き換え、投稿ONでは投稿期間・種類を優先する。狭い幅では投稿フィルター表示中のリフト凡例を隠す。

## データ・写真

追加マイグレーションは `prisma/migrations/20261024000000_community_contributions/migration.sql`。既存データの削除・再作成はしない。新規モデルは `CommunityPost`, `CommunityComment`, `CommunityLike`, `CommunityNotification`, `CommunityReport`, `CommunityModerationJob`, `ContributionPhoto`, `ContributionRateBucket`。`User` に公開名・選択方式・管理者による投稿停止日時、`EditRequest` に送信キーと写真関連を追加する。

写真は1枚8MB以内、公開投稿1件6枚、匿名修正1件3枚。バッチ全体48MBまで。実体を検証し、2048px以内のWebPへ変換、EXIF/GPS・元ファイル名を除去してDBに保存する。画像を public 配下や外部ストレージへ出さない。専用配信ルートが公開状態・管理者権限を確認し、`no-store` を返す。アカウント削除で写真実体・投稿・コメント・星・いいね・プロフィール等をDBの外部キーで削除する。匿名の修正依頼はアカウントと結び付けない。

JPEGのEXIF GPSを端末内で読み、投稿者が確認したピンだけを保存する。端末・画像ライブラリがHEICを読めない場合はJPEGへの変換を案内する。動画・自然地形のジャンプスポット・体感難易度・当日の営業情報の手動変更は対象外。

## 初期設定

1. 通常の接続先を確認して `mise run db:generate`、`mise exec -- pnpm prisma migrate deploy` を実行する。ここで本番DBへの適用は実行していない。
2. Google OAuthは既存設定を再利用する。新しいプロバイダーは不要。
3. 本文の外部AIチェックを使う場合はサーバーの `OPENAI_API_KEY` を設定する。APIは [OpenAI Moderation](https://developers.openai.com/api/docs/guides/moderation) の `omni-moderation-latest` を使う。外部へ送るのは本文だけで、写真は送らない。
4. 写真もAI確認するには、**サイト内ネットワークで運用するAI判定サービス**を用意し、`COMMUNITY_MODERATION_URL`（例 `http://moderation:8080/v1/moderations`）を設定する。必要なら `COMMUNITY_MODERATION_TOKEN` と `COMMUNITY_MODERATION_MODEL` を設定する。URLはループバック・プライベートIPv4・コンテナ名に制限し、外部URLとリダイレクトを拒否する。
5. AIサービス未設定・失敗時も投稿は即時公開され、管理画面で未処理・失敗を確認できる。写真用サービスがない場合、本文の確認結果と写真の確認待ちを区別して残す。判定サービス自体のモデル運用はこのリポジトリには含めない。
6. `CONTRIBUTION_TRUST_PROXY=true` は信頼するプロキシが **常に X-Real-IP を上書きする構成だけ**で設定する。既定はfalse。通常の匿名送信には追加操作を求めず、短時間の連投だけブラウザ内の計算確認を行い、DB共有の頻度制限も適用する。

Docker ComposeとGitHub Actionsにも設定を渡す。APIキー・サービス用トークンは同名のGitHub Secrets、URL・モデル・プロキシ設定は同名のVariables。未指定の任意設定は既存コンテナから引き継ぐ。サービス判定JSONはOpenAI Moderation互換の `results: [{ flagged: boolean, categories: {...}, category_scores: {...} }]`。判定リクエストは `{ model, input: [{type:'text', text}, {type:'image_url', image_url:{url:'data:image/webp;base64,...'}}] }`。画像を外部へ転送しないサービスを運用すること。

## 確認手順

- `http://localhost:3000/rusutsu` でスキー場を開き、修正を匿名で送信。公開画面に反映されていないことを確認する。
- `/rusutsu/admin/corrections` で投稿時・現在・提案を比較し、候補調整と項目ごとの承認・却下を行う。別画面で先に値を変えた場合は競合として拒否される。
- 未ログインで「＋投稿」を開くと、入力前にGoogleログインとなる。公開名を設定し、A・Bコースを入力して一括送信。両コースに独立したレポートが表示される。
- 投稿を編集・削除し、別ユーザーでコメント・いいね・コブなし／撤去報告。地図の「投稿」は既定OFFで、現地確認日・種類で切り替える。
- 別アカウントで投稿・コメント編集ができないこと、修正根拠写真が管理者以外には404になることを確認する。
- アカウント削除後に本人の写真URLが404になり、他人の独立した追加報告が残ることを確認する。

## 検証と制約

2026-10-25の検証では、全体テスト8,670件中8,583件成功・87件スキップ・失敗0件、読み取り専用BiomeチェックとTypeScriptチェックが成功した。本番Next.jsビルドも専用出力先で確認。別途、実際のPostgreSQLによる統合テスト2件が成功し、公開投稿と匿名修正の認証・CAS・重複・部分反映・削除・写真配信・版付きAI判定を検証した。地図レイヤーはMapLibre自身のスタイル検証でも確認する。

ブラウザでは375px／1440pxで投稿一覧・入力画面・関連URL修正を確認し、匿名の複数項目と写真3枚、地図の新規線、一括修正、地図をタップする区間設定を送信して完了画面まで確認した。専用DBで全件送信・提案した座標／名称・未承認状態・正式データ未変更も確認。実際のGoogle OAuth、実機の写真選択やGPS、管理者による一連の画面操作は追加の手動確認が必要。すべての操作をE2Eで網羅したものではない。

統合テストは明示した専用ローカルDBだけを使用し、通常の `DATABASE_URL` を流用しない。

```sh
COMMUNITY_TEST_DATABASE_URL=postgresql://community_test@127.0.0.1:55501/postgres mise exec -- node --import tsx --test src/server/community/community.integration.test.ts
CORRECTIONS_TEST_DATABASE_URL=postgresql://community_test@127.0.0.1:55501/postgres mise exec -- node --import tsx --test src/server/corrections/corrections.integration.test.ts
```

DBは初期化済み・専用のものを別途用意する。テストに本番のURLを設定しない。検証用ログ・画像・補助スクリプトは `src/private/data/resorts-temporary/` 以下でGit対象外。

残る運用上の条件は、写真用AIサービスの設置、実際のGoogle OAuth接続での確認、HEICの端末依存の変換対応。`DATA_API_BASE_URL` を使うリモート編集環境では匿名修正は誤ったローカル正本へ書かないよう拒否するため、正本DBを持つ公開サーバーで利用する。修正画面の地図カメラそのものの復元は行わず、提案した線・属性・テキストを24時間保存する。

未登録の地図へ最初の線を承認する際は、元データと派生データを同時に作成する。既存の線があるのに派生データだけ欠けている場合は、既存形状や標高情報を推測で作り直さず反映を拒否する。先に既存の地図データ整備手順で整合性を復旧する。
