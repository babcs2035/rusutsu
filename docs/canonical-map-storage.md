# コース・リフトの正本と一覧集計

`map-canonical-v2` の切替後は `map_courses` / `map_lifts` が正本。
スキー場単位のGeoJSON、対応表JSON、コース/リフトの詳細JSONは `data_documents` に保存しない。
従来の詳細JSONにしかない属性も移行時に取り込む。
既存の編集画面・編集申請API向けには、個別レコードから文書形式を生成する。
文書のキー・ハッシュ・版番号は競合検出用として維持する。

## 保存単位

- `geometry`: 編集元の線。`derivedGeometry`: 標高取得・間隔調整後の線。
  両者は用途・座標密度が異なる。全Featureの二重保存はしない。
- 名前・難易度・公式距離/斜度・各属性、マップ計算の距離/標高差/斜度は専用列。
  未知の追加属性だけ `properties` / `derivedProperties` に残す。
- `crawledNames`: 各線の対応先の名称（表記揺れを含む）。名前から勝手に対応を推測しない。
- `status`, `latestNote`, `officialUpdatedAt`, `statusObservedAt`, `statusSnapshotId`,
  `statusName`, `statusSourceUrls`: 現在値として採用した営業情報。
- `map_document_states`: 文書形式への変換に必要なメタデータと版。
  対応表の並び順は線IDで保持し、マップ側の相手がない公式項目も保持する。
- `ski_resort_operation_summaries`: 一覧用の数値。画面表示時は座標も取得原本も読まない。
- 既存のクローラー原本・取得履歴、天気・積雪は変更しない。

## 更新

採用済み営業情報の変更、正式なマップ・対応付け・標高・基本情報の保存、
スキー場の統合・連携解除と同じトランザクションで現在値と集計を更新する。
編集申請の提出だけでは更新しない。古い取得・失敗・Wayback検証は現在値を上書きしない。
対応先の取得漏れは不明にし、クロール採用時は警告も保存する。
連携エリアは子の取得結果から親と表示対象の子の集計を更新する。
座標変更で既存の標高が無効になった場合は、再取得まで基本情報の総数で不明表示する。

集計はコースの区間/別ルートを同じグループとして数え、○・△を営業として扱う。
営業情報がある場合は対応付け済みだけを対象にする。
営業情報がない場合は名前付きマップのグループ数（リフトは設備数）を使う。
マップなし・コースの標高未取得時は基本情報へフォールバックする。
営業数の欠測はNULLとし、0件への読み替えは行わない。

## 切替手順

正本DBを持つサーバーで、新旧両形式に対応したアプリを先に配置する。
旧アプリの書き込みプロセスは切替前に止める。

```sh
pnpm prisma migrate deploy
node --import tsx src/private/scripts/migrateCanonicalMaps.ts --dry-run
node --import tsx src/private/scripts/migrateCanonicalMaps.ts --apply --expected-hash <dry-runのinputHash>
```

切替は全体を同じトランザクションで行う。元文書を `map_document_backups` に退避し、
個別レコード・対応付け・座標・件数を確認してから元文書を削除する。
対応が曖昧な標高付きの線があれば中断し、原本を削除しない。
マーカーがある場合は再実行しても再移行しない。
既存IDは維持する。マップがないスキー場も集計行を作成する。
旧 `feature` / `derivedFeature` 列は旧アプリとの段階移行のためnullableで残すが、
移行済みの現在レコードではNULLとし、新しい保存では使用しない。

ローカルの `DATA_API_BASE_URL` が旧サーバーを指す間、一覧は基本情報による不明表示とし、
旧来の全件マップ集計には戻らない。実際の切替はデータAPI側で行う。
