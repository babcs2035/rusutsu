<!-- 既存機能とデータを維持し，アプリケーション・収集処理・運用・文書を整理するための実施計画． -->
# p0003: リファクタリング計画

## 1. 変更の範囲と維持条件

対象は公開画面，管理画面，認証，API，Server Actions，DB，収集 worker，private submodule，CLI，CI/CD，文書とする．処理はできるだけサーバー側へ置き，機能の入口と業務処理・永続化の責務を揃える．既存の操作と結果を維持した上で，セキュリティ，処理の重複，配備先の容量，UI の不統一を解消する．

- 検索・並び替え・比較リスト・料金・推薦・営業情報・投稿・訂正・編集／承認・写真・通知・滑走記録・匿名利用・オフラインの機能を維持する．リンク・共通パスの掲載条件，収集結果の採用条件，管理者の監視・診断，既存の公開／非公開の区分も維持する．
- リファクタリングの適用だけで既存の DB 行・値・ID・参照・NULL・文書 hash/version を変えない．端末の保存形式と共有済みの画面 URL も維持する．通常の業務操作による更新は継続し，過去 migration の書換え，ID の再発番，データの一括補正・削除は行わない．
- Google の email・name の取得，アバター，Google 名・ニックネーム・匿名の選択を維持する．地図のインスタンス・表示範囲・選択，入力・下書き・写真，scroll を，通信方式や部品の移行で失わせない．
- API の後方互換性は要件としない．全呼び出し元を同時に更新し，不要な endpoint と互換 adapter を削除する．内部 API の資格情報は `API_BEARER_TOKEN` 一つへ統一し，人の操作に必要な権限・所有者の検査は維持する．
- バックアップは配備先の `backups/` へ毎日 03:00 JST に取得し，最新 7 世代を保持する．font は Google Fonts の CDN を使う．
- 各変更はレビューできる小さな PR に分ける．共通規約と Skills の参照先は編集しない．

## 2. 実施順序

| 段階 | 対象 | 着手条件 |
| --- | --- | --- |
| 1 | R01: 機能と試験の対応付け，単一のテスト DB，R12/R14: 入口と権限の確認 | 現行の業務結果・保存状態を基準として記録する |
| 2 | R10: script とコマンド，R15/R16: 配備後の整理とバックアップ | 運用の実行環境と復旧手順を確認する |
| 3 | R13/R19: DB・API・データ取得／更新方式 | 全利用者・所有者・副作用・移行先を対応付ける |
| 4 | B01/B02/B05，R02〜R09: 永続化・通信・業務処理の責務 | 対象の正常・境界・失敗・競合を検査できる |
| 5 | R17/R18: 読み込み処理・状態管理・UI | 同じ条件での計測と既存画面の比較基準を用意する |
| 6 | R20: 不要な実装と deprecated の削除 | 現役の利用経路を移行し，機能と運用を確認する |
| 7 | R11: docs の最終整理・更新，docs/plans の削除 | 実装と検証を完了する |

手順や設定の説明は各変更と同時に更新し，最後に文書全体を整理する．API の移行は機能群ごとに親リポジトリと private submodule の対応する版を一組で配備する．内部処理の抽出と通信契約の変更は別の PR とする．

## 3. 全機能を少ない重複で検査する（R01）

対象: `scripts/runTests.mjs`，全試験，`tsconfig.json`，CI．runner は R10 で `runTests.ts` へ移行する．

### 試験の役割と実行環境

- 全機能について，利用者の操作，期待結果，権限，失敗条件，担当する試験を対応付ける．公開・管理画面に加え，収集・公開・CLI・配備／復元・Service Worker を含める．未検証の機能を補い，同じ仕様を複数の層で繰り返す試験は統合する．
- 純粋な業務条件は単体試験，所有者・永続化・transaction・競合は DB 統合試験，HTTP 固有の認証・入出力は Request/Response 試験，画面遷移・地図・入力保持・オフラインは代表的なブラウザ試験が担う．API と Action の両方で業務ロジック全体を再試験しない．
- テスト用 DB は一つとし，すべての DB suite が `TEST_DATABASE_URL` を使う．community・corrections・editor workflow・canonical maps・crawl latest・favorites/recommendations 等の個別接続変数を廃止する．通常の開発 DB と本番 DB への接続を拒否する検査を共通化する．
- DB 試験は直列実行し，migration，fixture の投入・後始末，中断後の初期化を統一する．試験項目ごとの DB を作らず，他の suite の残存データに依存させない．復元試験も使い捨ての試験環境で他の DB 試験と排他する．
- setup・Prisma 生成・導入版 Next.js の型生成を再現可能にし，dev/build/QA の生成型を混在させない．CI では migration 後に DB suite を実行し，必須設定の欠落や未実行による skip を成功として扱わない．稼働中の dev の生成物は削除しない．
- 運用試験の一時ディレクトリは安全ガードに適合させる．ブラウザ試験は単体試験と実行段階を分け，既存の test コマンドの引数で選択する．suite ごとにコマンドを追加しない．

### 残す試験と削る試験

大量の直積ケースは，業務上の分岐・境界・既知の不具合を検出する代表ケースへ絞る．同じ結果の反復，ソース文字列や内部構造だけを固定する試験，標準 API・ライブラリ自体を試すケースは削除または振る舞いの試験へ置き換える．削除時は，残る試験が同じ仕様を検出する根拠を確認する．

料金の独立した公式期待値，認可，データ保全，競合・二重送信，通信断時の復元は残す．共通パスの複数選択，営業中／全体での距離・標高の判定，推薦元の別ルートと候補のメインルートの区別，比較リストの所有者・順序・空リストの保持も検査する．試験数や一律の coverage 率を目標にせず，未検証の仕様，重複ケース数，実行時間を比較する．

**完了条件:** 新規 checkout と setup から型・整形・単体・DB・必要なブラウザ試験を実行でき，全機能に検証の担当がある．試験を減らしても業務上の分岐と安全性の検査が欠けない．

## 4. すべての入口で情報と権限を保護する（R12/R14）

route，Server Actions，RSC，管理画面，cron/CLI，worker，写真・ファイル配信を対象に，認証方式，actor，現在の DB 権限，所有者，入力・展開・転送量，外部通信先，返却項目，cache，副作用を確認する．

| 境界 | 実施内容 |
| --- | --- |
| 公開の一覧・地図・詳細・料金・推薦・リンク・共通パス | 公開 DTO を明示し，内部キー・原本全体・非公開ユーザー情報を返さない．位置情報や本人の条件を含む要求を公開 cache に入れない |
| お気に入り・比較リスト・通知・滑走記録 | 取得・更新・削除のすべてに本人の所有条件を適用する．他人の ID，アカウント切替，古い要求の反映を試験する |
| 投稿・訂正・通報・匿名リアクション | CSRF，頻度制限，challenge，version，冪等キー，匿名 proof を維持する |
| 編集・承認・管理用診断 | viewer/editor/admin，申請の所有者，ロールで許可される範囲，現在の DB 権限を検査する．editor は全施設の申請を作成できる．同時承認と降格後の操作を検査する |
| 内部 API・収集 worker | `/api/admin` 以下で単一 token を検証し，ブラウザへ渡さない．remote worker に DB の資格情報を配らない．人の操作は別途 actor と業務権限を確認する |
| 写真・添付・診断 DOM | 公開可否と原本の読込権限を検査する．秘匿する 404，private/no-store，添付配信，容量・画素数・展開量の制限，EXIF/GPS の除去を維持する |
| 外部 HTML・画像・地図・埋め込み・共有画像 | URL と redirect 先，本文の実サイズ，時間制限，HTML/SVG，生成キューを検査する．秘密を添えた要求を別 origin へ転送しない |
| ログ・バックアップ・配備 | HTTP の公開領域へ置かず，ファイル・mount・実行権限を限定する．秘密を含む env/inspect/dump や個人情報をログへ出さない |

- Cloudflare Tunnel とアプリ内の検査を併用する．直接到達経路，ポート，Host/Origin，代理ヘッダーを確認し，`CONTRIBUTION_TRUST_PROXY` は入口が `x-real-ip` を確実に上書きする構成でのみ有効にする．正式ホストと開発用 `*.trycloudflare.com` の許可を分離する．
- Cookie の secure/httpOnly/sameSite，CSRF，OAuth の state/PKCE を検査する．Server Actions の全体 64 MiB と個別 upload の制限は認証前の受信量も含めて確認する．path traversal，大容量，偽装ヘッダー，未認証要求を各入口で拒否する．
- CSP は Report-Only で地図・天気 iframe・写真・GA・OAuth・Google Fonts を確認してから適用する．Referrer-Policy，nosniff，frame 制御，Permissions-Policy も利用中の機能に合わせ，位置取得や正当な埋め込みを維持する．
- Service Worker/CDN/サーバー cache に本人限定情報を混入させない．email，token，Cookie，秘密 query，GPS，写真・本文を監視や外部サービスへ必要以上に送らない．
- Google の scope/profile と既存 User/Account を一括変更しない．`sub/providerAccountId` と既存 userId で本人を識別し，email や client 指定 role で代用しない．OAuth token を session・公開 DTO・ログへ出さず，Google 名を公開名に選んでいない人の元の名前を公開しない．

**完了条件:** 全入口に認証・認可・入力・返却・cache の方針があり，未認証，他人の ID，不正 token，権限降格，通信・ファイル境界の失敗を検査できる．匿名利用，OAuth，位置取得，診断，名前・画像の表示が継続する．

## 5. DB とデータ取得・更新の責務を揃える（R13/R19）

### DB は物理構造と既存データを保って整理する（R13）

schema と repository の所有者を，認証・本人の状態，施設・共通パス・リンク，地図の正本，クロール・時系列，投稿・申請，派生値・実行管理に分ける．宣言順と説明を整理し，物理テーブル・列・型・default・制約・enum・`@map/@@map` を維持する．書式整理では schema diff を空にする．index の追加は計測とロック時間を確認した独立変更にする．

- Course/Lift/Ticket と MapCourse/MapLift，DataDocument と MapDocumentState は用途を区別し，名前の類似で統合しない．JSON のキー順・保存 byte・hash/version と正本の所有者を保つ．
- PassProgramResort の名寄せ結果・firstSeenAt/lastSeenAt/removedAt，料金文書から保存する購入／出典リンク，地図の min/maxElevation，営業集計の全体／営業中の距離・標高，推薦の routeKey/isMainRoute/calculationVersion を維持する．削除・再投入や一括再計算を整理の適用へ混ぜない．
- 正本・クロール現在値・営業集計・推薦特徴量の同時更新を維持する．読込時の旧版集計の更新も副作用として明示し，抽出に伴って全件再構築や部分確定を発生させない．

### サーバーで取得・計算し，必要な入口だけを残す（R19）

全 page・Component・hook・Action・Route Handler・worker/CLI を，呼び出し元，初期表示／操作後／定期実行，認証，cache，副作用，移行先に対応付ける．導入版 Next.js のガイドを確認し，次の構成へ揃える．

| 用途 | 実装する形態 |
| --- | --- |
| 初期の一覧・詳細・管理画面・metadata | Server Components → 共通 service/repository → Prisma または正本．同一アプリの API や取得用 Action を経由しない |
| 操作後の詳細・比較・料金・推薦等の取得／計算 | Client Components → Route Handlers → 同じ service．必要な結果だけを返し，業務計算や原本の整形はサーバーで行う |
| 投稿・訂正・本人の設定・お気に入り・比較リスト・編集／承認 | Server Actions → 共通 service．認証・認可・入力検証・transaction・冪等性を維持する |
| upload/download・マップ中継・共有画像・OAuth callback・外部 client | HTTP 境界に適した Route Handlers．既存の容量・認証・送信方式に適する upload は Server Actions を使う |
| ポーリング・操作後の再取得・楽観的表示 | 既存 cache の所有者と無効化を整理する．共通管理が必要なら SWR または TanStack Query の一方を選び，単発の fetch まで一律置換しない |
| 収集・定期実行・長時間処理 | 既存の独立 worker/scheduler → 共通 service．remote は管理 API を使い，要求処理内で長時間 job を実行しない |

- `src/actions/skiResorts.ts` と推薦等の取得用 Action から業務処理を service へ移し，RSC と route が直接使う．既に route を使う推薦先読みや，近い順のときだけ取得する Google マップのリンクを，Action や初期取得へ戻さない．別環境の正本への remote 通信は維持する．
- 認可・業務検証・DB 更新を既存 service に集約し，入口は通信形式の解析と認証済み actor の受け渡しを担う．server 実装を client へ import せず，公開 DTO のみを渡す．
- Client Components は地図・入力・位置取得・端末保存・即時の絞り込み・オフラインに必要な範囲へ限定する．静的な表示は RSC に寄せ，大きな原本を送ってブラウザで加工する構成を減らす．既存のローカル操作を通信待ちに変えない．
- 通信方式と cache を分けて設計する．本人別 key，鮮度，取消，mutation 後の再検証・無効化，失敗時の復元を維持する．SSE/WebSocket/Job Queue は現行要件で必要な場合だけ採用する．
- HTTP の利用者がなくなった endpoint は廃止し，route・専用 DTO/parser・client・試験・文書の参照を移行と同じ変更単位で削除する．共有する業務処理とその試験は残す．予備 API や恒久的な互換 route は作らない．

### 管理 API と設定名を統一する（R13）

内部用・管理用など一般公開しない endpoint は `/api/admin` 以下へ集約する．配信 URL の basePath は `/rusutsu` とする．公開・本人用・匿名利用の資源と OAuth callback は用途に応じたパスへ分離し，管理操作を混在させない．次表は HTTP の利用者が必要な資源に対する管理側の相対パスとし，RSC/Action だけで足りるものは route を設けない．

| 資源 | `/api/admin` 以下の統合先 |
| --- | --- |
| 施設・統合・表示グループ | `resorts`，`resorts/:id`，`resorts/merges`，`resorts/unlinks`，`resort-groups` |
| 施設のリンク・料金・レビューの保存／公開・雪マジ | `resort-links`，`lift-tickets`，`reviews`，`yukimaji` |
| 共通パスの掲載・追加／削除・名寄せ状況 | `pass-programs`（名寄せ状況は `view` クエリ） |
| 地図・文書 | `maps/resorts`，`documents` |
| 営業集計・収集前の比較値・推薦 | `operations/summaries`，`operations/baselines`，`course-recommendations` |
| 収集実行・監視・現在値・対応履歴 | `crawl/runs`，`crawl/monitor`，`crawl/current` |
| artifact の登録・検索・取得 | `crawl/artifacts`，`crawl/artifacts/:id/content` |
| 申請・投稿の管理と remote 操作 | `edit-requests`，`community` |
| 編集画面での施設切替後の取得 | `editor/queries`（管理セッションと DB の編集権限を使用） |

- 識別子（`resortId`，`runId`，`kind`/`id`，`seasonId` 等）は REST のサブパスではなくクエリパラメータで受け，実行の issue・対応履歴（mapping）も `crawl/runs` の `include`／`crawl/monitor`・`crawl/current` の `view` に集約する．申請の操作（承認・却下・取り下げ・修正）は `edit-requests` のコマンド型 POST（`operation` フィールド）で扱う．これにより route 数を抑え，DTO・エラー・token 検証を `internalApiHttp` に一元化した．

- 内部 token の設定は `API_BEARER_TOKEN` 一つ，接続先は `API_BASE_URL` に統一する．既存の ADMIN/CRAWLER/DIAGNOSTICS の 3 token と `DATA_API_BASE_URL`，旧名の別名設定，token 別 scope の分岐を廃止する．`.env.example`，ローカル設定のキー，GitHub Secrets/Variables，workflow，Compose，設定生成・検証，全 client/worker/CLI，試験・文書を同時更新する．秘密の値は表示・記録しない．
- 単一 token は信頼するサーバー処理の共通資格情報とし，従来の token 別の制限は廃止する．人の操作では session/actor と現在の権限・所有者を検査する．proxy のログイン redirect で機械要求を遮らず，各 route でも認証する．
- DTO とエラー形式を共通化し，[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) に沿って code を定義する．未認証・権限なし・競合・秘匿する 404・頻度制限の意味を維持し，detail に内部情報を出さない．
- 資源の統合でも batch 取得，source/season，FILE/DATABASE の実行履歴・ID・絞り込み・ページング，提出・承認履歴，原子的な複数更新を維持する．

**完了条件:** 全機能に適切な入口と業務処理の所有者があり，残る endpoint に必要な HTTP 利用者がある．旧 route と旧設定の参照がなく，操作・結果・副作用が一致する．単一 token への統一以外で権限を広げない．DB は使い捨て環境の一貫した snapshot で全行の値・参照・文書を照合し，件数だけで判定しない．原本をログへ出さない．

## 6. 業務処理・収集・状態管理を整理する

| ID | 対象と変更内容 | 維持する結果・検査する境界 |
| --- | --- | --- |
| B01 | private の Amedas/Gelendes/SkiAreas/SnowDepths/SnowFalls は取得・解析・検証を先に完了し，削除と挿入を適切な transaction へまとめる | 取得・挿入の途中失敗で旧データを保つ．正常な空集合と失敗を区別し，重複以外の例外を隠さない．作成用 upsert と補完用 update を一律に置換しない |
| B02/B05 | 外部中継と内部 client の本文読込まで時間・実 byte 数を制限し，redirect・abort・retry を整理する | ヘッダー受信で期限を解除しない．更新要求を自動再送せず，正常な既存データを処理できる上限を確認する |
| R02 | finalizedResortGeojson の型・色・区間計算，距離・標高の共有計算から I/O を分離する | 実画面が使う関数を試験する．座標順・配色・欠測，斜面距離→水平距離の代替，○・△の営業中判定，出典なしの null を維持する |
| R03 | home/map/resort-detail の日付・断面図・MapViewSnapshot・query の所有者を揃え，循環 import を解消する | 型と実行時 import を区別し，server の実装を client bundle へ入れない．既存の共有計算を重複して抽出しない |
| R04/R05 | `calculateResortPriceTiers` を入口として，購入段階・カレンダー・対象者・単日／複数日券・レンタル／セット・出典・整形の責務を分ける | 一覧・詳細・比較の金額と順位を一致させ，無料・不明・部分的な欠測・期間外を区別する．`summarizeResortPrice` の想定外例外を検知できるようにし，業務上の欠測表示を維持する |
| R06 | HomeClient・地図・session・Service Worker の状態，保存先，失効，非同期結果の採用条件を整理する | 古い結果・アカウント切替・再接続・WebGL 復帰を検査する．比較の 10 分の鮮度，裏での再取得，可視施設の地図優先取得，端末保存を維持する |
| R07 | 投稿 UI・下書き・写真 URL・送信制御を分け，比較リスト編集の本人状態と画面状態も既存 hook/service へ整理する | 投稿の冪等キー・version・scope，写真欠落・保存禁止・遅い位置取得・送信中の終了を維持する．比較リストの即時保存，名前だけの更新，順序，最後の施設を外した空リスト，一段ずつ戻る操作を維持する |
| R08/R09 | 正本更新の検証・更新計画を純粋な処理へ分け，commit の所有者と CLI の CAS を整理する | 正本・現在値・営業集計・推薦を部分確定させない．競合時に停止する処理と最新へ再適用する処理を区別し，direct/remote で結果を照合する |

共通パスの収集は，別名表の候補順と完全一致による名寄せ，半数未満への減少時の反映拒否，removedAt による履歴，初回取込を追加扱いしない規則，未名寄せの監視を維持する．本番内での NSD リンク反映と CLI の実行範囲，サービスごとの確定・失敗・再実行を明示し，整理のために remote 書込や全サービス一括 transaction を追加しない．

crawl_latest とツアーリンクの共通化では，施設別 parser・営業日の鮮度・古い営業表示の除外・retry の navigation 状態・source 別の置換範囲を維持する．大量の施設別実装を同じ形に揃える目的で書き換えず，共通部の変更は固定 fixture と代表的な施設の回帰試験で確認する．

推薦は現行の版・点数・同点順序を維持する．別ルートも検索元に使い，候補は他施設のメインルートのみとする．お気に入り／全体の切替，お気に入りなしで全体へ切り替える動作，account・scope 別 cache，既存の先読みと期限を保つ．正本の更新と特徴量の整合を検査し，整理だけで再計算しない．

行数やファイル数を基準に分割しない．同じ責務を持つ既存 service・hook・共有関数を優先し，汎用 repository，イベントバス，一律の feature テンプレートを新設しない．

## 7. 読み込みと UI を揃える（R17/R18）

### 読み込み処理と転送量（R17）

初期表示，詳細切替，比較，料金条件，推薦，投稿，管理，オフライン復帰で，DB query・API/Action 数，転送 byte，計算時間，再描画，地図生成数を固定データで計測する．

| 対象 | 実施内容 |
| --- | --- |
| AnimatedPanel | 描画に使わない同期 state/effect を除去し，transition と mount を保つ |
| filterResorts・searchWord | 同じ keyword の token 化を絞り込み単位へまとめ，不変の検索文字列を再利用する．読み・旧名・共通パスの全選択一致・距離／標高・営業中／全体の判定を維持する |
| 詳細・比較の地図 | 集計結果が一致する場合だけ，withMap=false の内部計算と後続の地図取得の重複を減らす．既存 chunk・優先度・鮮度・失敗時の保存分利用を維持する |
| お気に入り・比較・推薦・Google マップリンク | 既存の同時要求共有と cache を一つの所有者へ整理する．遅延取得・先読みを保ち，失敗を成功した空データとして固定しない．認証確認・mutation 後の無効化・アカウント分離を省かない |
| client bundle・画像・外部埋め込み | 初期取得に不要な原本・計算をサーバーへ寄せ，必要な時期に読む．共有画像・オフライン資産・埋め込みの操作を維持する |

font は `next/font/google` の自己配信から Google Fonts の CDN へ切り替える．Geist・Bricolage Grotesque・Manrope の使用箇所，weight，CSS 変数を保ち，必要な字体だけを指定する．`fonts.googleapis.com`・`fonts.gstatic.com` の CSP と接続設定，`display=swap`，fallback を整える．通信断や CDN 障害でも文字と既存のオフライン操作を利用でき，折り返しやレイアウトを崩さない．

**完了条件:** 同じデータ・端末幅・通信条件の cold/warm cache で結果・鮮度・復元を維持し，対象の処理回数または転送量の減少を示す．既存の計測値や導入済み cache を無視して新たな待ち時間を加えない．

### 既存部品とデザイントークン（R18）

- 公開・管理・ログイン・比較・詳細・投稿・訂正・全編集画面で，既存 shadcn/ui・Base UI の Button/Input/Select/Tabs/Dialog/AlertDialog/Collapsible/Tooltip/Table/Toast/Spinner を使う．不足は既存 variant を拡張し，自作の基本部品を増やさない．
- 同じ役割の色・文字・余白・border・radius・focus・disabled を token へ揃える．お気に入りのピンク，比較の青，営業・難易度・斜度・投稿種別の意味色を維持する．
- ToggleSection は Collapsible，UnderlineTabs は既存 Tabs へ内部を移す．開閉・選択・mount・keyboard/focus・保持状態を一致させる．ライブラリを使う LoadingSpinner/ConfirmDialog，FilterConditionFields，WeatherLinkChips，LinkGroups 等の既存共有部品を直接再利用する．
- 通常・読み込み・空・エラー・完了でヘッダー・×・幅・高さを揃える．比較リスト編集の重なる画面，天気 iframe 内の横 scroll と比較列の scroll，地図・断面図の連動を維持する．詳細・比較の画面本体へ常設のログイン／アカウントボタンを置かない．例外として，比較リスト保存ダイアログ内で未ログインかつ保存を試みたときだけ表示される「ログインして保存」は機能上の必須プロンプトであり，この禁止の対象外とする．
- shadcn 化の例外：単一責務の操作子でないため raw の基本要素を残す箇所がある．(1) 複合コンポーネント（トグル・タブ・DnD 行・マップ操作・ドラッグハンドル・ソート・リスト行・ピル・テーブルセルボタン・ラジオカード）は shadcn Button/Select/Label の base（h-8・rounded-lg 等）が独自レイアウトと衝突するため raw `<button>` を維持する（残り 65 件）．(2) 共有 inputClass フォーム（SlopeRequestEditor・LiftRequestEditor・ValueFields・RelatedLinksEditor）は全フィールドが同一のカスタム className を共有するため，一部だけ shadcn 化するとフォーム内の見た目が割れる（select 7 件・label 9 件を含む）．(3) hidden・checkbox・radio・range・file の input は shadcn に対応部品がなく raw のまま（checkbox/radio は shadcn Label でラップ）．`native-select.tsx`・`label.tsx`・`textarea.tsx` 内の raw 要素は shadcn 部品本体であり，置換対象外．

**完了条件:** [UI 指針](../docs/d0010_ui-guidelines.md)に従い，PC と 375 px，詳細 346/500 px，該当 popup 320 px で画像・操作・computed style を比較する．4 サイトの天気リンクが各 1 件のときの横一列，閉じる／戻る，入力保持，レスポンシブな余白と折り返しを確認する．

## 8. script・コマンド・配備先を整理する（R10/R15/R16）

### TypeScript と必要なコマンドへ統一する（R10）

- `scripts/` 以下の `.mjs` は運用・起動・設定生成・fixture・ブラウザ試験・worker コピーを含めてすべて `.ts` にする．不要なものは R20 で削除する．具体的な型を付け，ESM import，入口判定，子プロセスの実行を更新する．
- package/mise，shell，CI，Docker，Compose，scheduler，試験・文書の呼び出しを同時更新する．既存 TypeScript 基盤を使い，devDependency のない本番 image や配備先にも必要な変換済み成果物または実行基盤を含める．`tsx` や Node.js の直接実行が可能と仮定しない．
- `package.json` と `mise.toml` の用途・利用者・副作用を対応付ける．Node.js の開発・build・品質検査は package scripts を実装元とし，mise は呼び出しと環境・DB・運用を担う．同じ処理を重複記述せず，既存の入口名を優先する．
- 別名・固定オプション違い・未使用の移行用コマンドを統合・削除し，差は既存 CLI の引数で指定する．setup/dev/build/start/check/test と必要な DB・収集・公開・復旧の操作を欠かさず，項目ごとにコマンドを追加しない．dry-run/apply，接続先確認，削除の明示を維持する．
- CI と本番の Node.js 等の実行版を揃え，型検査を build の必須条件とする．action/image の参照を固定し，親・private・lockfile の組合せを再現する．CI の読み取り専用検査と手元の自動修正は既存コマンドの引数で整理する．

**完了条件:** 管理する script と実行参照に `.mjs` が残らず，全 `.ts` が型検査される．setup・開発・build・試験・配布物の起動・配備・復元を各環境で確認し，引数・終了コード・signal・標準出力／標準エラー・副作用を維持する．

### 配備成功後に Docker の不要イメージを整理する（R15）

1. 切替前に current の image ID・digest・成功 SHA を照合し，直前の正常版を記録する．
2. 配備の排他を取得してから SHA tag 付きイメージを取得する．配備と app/DB/公開画面の readiness 成功後，workflow の最後の SSH step で `docker image prune --force` を実行する．Docker daemon 上でタグがなく，コンテナからも参照されていないイメージを整理する．
3. cleanup は `continue-on-error: true` と warning annotation・通知を組み合わせる．失敗は通知し，正常な配備を巻き戻さない．

**完了条件:** 配備成功を条件に標準の dangling image 整理だけを実行する．現在版・切り戻し用・DB のタグ付きイメージと，稼働・停止コンテナが参照するイメージを保つ．

### 配備先に毎日 03:00 JST，最新 7 世代を保存する（R16）

- 日次・手動・配備前バックアップの保存先を `${DEPLOY_TARGET}/backups` へ統一する．Actions と運用 script が同じ正規化済み path を使い，HTTP 配信・Git 管理・image build・SCP の上書き／削除対象から外す．directory 0700/file 0600 を維持する．
- 日次 workflow は `0 18 * * *`（UTC，03:00 JST）とする．Actions の開始遅延も確認できるよう実行時刻と結果を記録する．DB 変更 manifest 差分・初期化・強制指定等の配備前取得も維持する．
- 用途別の枠・日数・byte 予算は設けず，検証済み完了世代を完了日時の降順に最新 7 世代だけ保持する．dump・metadata・checksum の検証と原子的な確定に成功した後，8 世代目以降を削除する．取得失敗では既存世代を消さない．
- 取得・保持削除・復元・配備を排他する．symlink や無関係な path を追わず，所有する世代だけを削除する．通常の EXIT で `.incomplete-*` を片付け，異常停止の残骸と破損世代は実行中でないことを確認して整理する．
- 手動バックアップで復元試験を選んだ場合は，同じ排他区間で新たに確定した世代を指定して復元する．
- 旧既定先 `~/.local/state/rusutsu/<Compose project>/backups` の保存物は内容を変えずに移し，照合・復元確認後に旧コピーを除去する．新旧を合わせて最新 7 世代を選び，移行時は dry-run の候補を確認して適用する．
- 一時 dump を含む空き容量を事前検査し，不足は通知して取得とバックアップ必須の配備を止める．正常な世代を先に削除しない．DB 内の写真を含む custom-format dump と，別 volume の artifact/共有画像の復元範囲を文書化し，volume は削除しない．

**完了条件:** 保存 path，cron，7→8 世代，日次／配備前を含む順序，取得失敗，容量不足，中断・破損・symlink，同時実行，旧保存先からの移行を検査する．保持世代から写真・認証・申請・クロール現在値を使い捨て環境へ復元する．

## 9. 不要物を削除し，文書を現行仕様へ揃える（R20/R11）

### 実装と deprecated の削除（R20）

親と private の script・ファイル・export・依存 package について，静的／動的 import，mise/package，CI，Docker，scheduler，CLI，ファイル名の探索，文書からの実行経路を確認する．役目を終えた route/Action/client，重複する変換・UI 部品，未使用の script・fixture・依存を削除し，参照も除く．単発 script は再実行・復旧・未完了の移行に不要であることを確認する．

`deprecated/` は配下を含めて削除する．現役の機能があれば現行の所有モジュールへ引き継ぎ，検証してから削除する．検索で参照が見つからないことだけを削除根拠にしない．DB の migration 履歴・業務データ・正本・写真・artifact・バックアップ・作業中のデータはコード整理の削除対象に含めない．

### 完了後の文書整理（R11）

- 実装と検証の完了後に `docs/` 全体をコード・設定・コマンド・配布物へ照合する．構成，DB と正本，API・認証，収集・公開，共通パス，料金・推薦，UI・オフライン，試験，配備・バックアップ・復元を最新の仕様へ更新する．README は起動と文書への案内に絞る．
- 重複する説明は統合し，旧構成・旧 API・旧設定・廃止コマンド・完了済みの移行手順は削除する．過去の検証記録にだけ残る現役の制約と復旧手順は現行文書へ集約し，不要な記録・画像・添付を削除する．
- `docs/plans/` は画像・添付を含めて削除する．現行仕様に必要な内容だけを適切な文書へ統合し，古い計画書を移して保存しない．直下の `plans/` と本計画書は削除対象外とする．
- 目次・リンク・コード例・設定名・コマンドを更新し，手順を検証環境で確認する．共通規約と Skills の参照先は編集しない．

**完了条件:** `deprecated/` と `docs/plans/` が存在せず，現役の依存やリンク切れがない．残る実装・コマンド・文書には必要な用途と所有者があり，現行仕様・制約・復旧手順を重複なく参照できる．

## 10. 全体の検証と反映

- 各 PR は要件適合性，既存機能・データへの影響，検証結果の三点で確認する．正常・空・欠測・境界・通信断・競合・二重実行・途中失敗の業務結果を比較し，API の JSON 形式の一致は要求しない．期待値を実装結果から作り直さない．
- 変更対象の suite を先に実行し，共通処理の変更後は整理した全体試験を行う．料金の公式期待値と DB 統合試験を含め，UI は既存画面との比較，Service Worker とオフラインは production モードで確認する．整形・lint は読み取り専用で検査する．
- 切替前に app/API/worker の対応版，停止・再開，退避対象，確認と復帰の手順を定める．旧 bundle・Service Worker・CLI の切替で未保存の下書き・写真・選択を強制 reload により失わせず，mutation の冪等キーを維持する．巻き戻しも対応版を一組で戻す．
- DB の値・ID・hash/version，指定外の権限，業務結果，地図・入力保持に差があれば反映を止める．削除候補に最新 7 世代，current/rollback，別プロジェクト，volume が含まれる場合も停止する．本番操作は確認済みの対象へ限定する．

共通の確認には mise の既存 task を使い，個別試験も test の引数で選択する．同じ処理を実装する package script を task から呼び，CI と手元で検査方法を揃える．

```sh
mise run check
mise run test
LIFT_TICKET_DATA_ROOT=src/private/data/lift-ticket mise run test -- --unit src/features/lift-ticket/utils/uiContract.test.ts
mise run build
git diff --check
```
