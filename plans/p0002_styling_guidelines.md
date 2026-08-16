# p0002: 全ページ・全コンポーネントのスタイリング指針

## 目的

全ページ・全コンポーネントのスタイリングを統一し，一貫した UI 体験を提供する．背景色との同化，margin/padding の過不足，メニューやモーダルの表示位置・挙動を一貫させる．

## 対象範囲

- `src/features/`, `src/shared/`, `src/components/ui/`, `src/app/admin/` の全コンポーネント
- `src/app/globals.css` のユーティリティ定義
- **除外:** `src/private/` 配下のスクリプト，クローラー関連コード

## 技術前提

- Next.js 16 (App Router) + TypeScript (strict)
- shadcn/ui (@base-ui/react) + Tailwind CSS 4
- Leaflet + react-leaflet / recharts
- フォント: `font-[var(--font-heading)]` = Bricolage_Grotesque（日本語見出し）, `font-sans` = Manrope（本文）
- ダークモード: 非対応（shadcn/ui 生成コンポーネント内の `dark:` クラスは無効）

## 指針

### 1. 背景色の階層

| 階層 | クラス | 用途 |
|------|--------|------|
| ページ背景 | `bg-gray-100` | `HomeLayout` の `<main>` |
| セクション背景 | `bg-gray-50` | フィルターオーバーレイ，リージョンカード |
| カード/パネル | `bg-white` | 全ての Card，FilterPanel，DetailPanel |

**禁止:**
- `bg-white/96`, `bg-white/80` などの半透明白をパネル背景に使用しない
- `bg-[var(--bg-light)]` をコンポーネント内で直接使用しない（`layout.tsx` の `<body>` でのみ使用）

**例外:**
- `backdrop-blur` と組み合わせたオーバーレイ（`bg-white/94 backdrop-blur-md`）は許可．使用箇所は最小限
- ダーク背景（`bg-[var(--admin-dark)]` / `bg-[var(--sidebar-dark)]`）上の半透明白は以下の値に限定する:
  - `bg-white/10` — AdminHeader のログアウトボタン（ダーク背景上のボタン背景）
  - `bg-white/20` — コントラスト調整（バッジ，アバター fallback，hover）
  - `bg-white/30` — ダークサイドバー上のバッジ，アバター border
  - `border-white/10` — AdminHeader の下辺ボーダー
  - `text-white/70`, `text-white/80` — ダーク背景上の補助テキスト

### 2. ボーダーの統一

| 用途 | クラス |
|------|--------|
| 標準ボーダー（カード・パネル外枠） | `border-gray-200` |
| 微妙な区切り（リスト項目間，テーブル行間） | `border-gray-100` |
| フォーカス/アクティブ | `border-blue-600` |
| shadcn/ui 入力フィールド | `border-input` |
| 編集ワークスペースの独自入力 | `border-gray-300` |

### 3. シャドウの統一

| 用途 | クラス |
|------|--------|
| 標準カード | `shadow-sm` |
| ホバー時 | `shadow-md` |
| モーダル/オーバーレイ | `shadow-2xl` |
| Admin カード | `shadow-lg` |

**許可されるカスタムシャドウ:**
- `shadow-[0_10px_30px_rgba(15,23,42,0.12)]` — モバイル検索ボタン
- `shadow-[4px_0_20px_rgba(0,0,0,0.06)]` — デスクトップ検索パネル

上記以外の `shadow-[...]` は禁止．

### 4. テーブルスタイル

`globals.css` の `table-header-cell` を全テーブルヘッダーに使用済み（38 箇所）．

```css
.table-header-cell   /* padding, font-size, font-weight, color, background, white-space */
.table-body-row      /* 標準行の border-color（定義済み・現在未使用） */
.table-row-selected  /* 選択中行の background（定義済み・現在未使用） */
```

**注意:** `.table-header-cell` は Tailwind のレイヤー外（unlayered）CSS であるため，ユーティリティクラスより優先される．例: ヘッダーセルに `text-center` を追加しても `text-align: left` を上書きできない．中央揃えが必要な場合は，ヘッダーと本文セルの両方を中央揃えに変更すること．

**行の共通パターン:**
```tsx
<TableRow className="border-gray-200 hover:bg-gray-50">
<TableRow className="bg-blue-50 hover:bg-blue-100 cursor-pointer">  {/* 選択行 */}
```

### 5. カード浮上バリエーション

`globals.css` に定義済み．未使用だが，新規カード作成時に使用することを推奨．

```css
.card-subtle    /* 標準コンテンツカード */
.card-elevated  /* 視覚的分離が必要なカード */
```

### 6. フォント

| 用途 | クラス |
|------|--------|
| 日本語見出し | `font-[var(--font-heading)]` |
| 本文 | `font-sans`（デフォルト） |
| モノスペース | `font-mono`（ID，数値） |

**ウェイト:**
- `h1`, `h2`: `font-bold`
- `h3`: `font-semibold`
- `h4` 以下: `font-medium` またはデフォルト
- `font-black`: `ResultCountBadge` のみ
- `font-extrabold`: `CompareWeatherTab` の天気リンクラベルのみ

**サイズ最小値:** `text-[0.6875rem]` (11px)．これより小さいサイズは禁止．SVG チャート内（Recharts の tick や tooltip など）のテキストはクラスベースの最小サイズ規則の対象外であり，可読性はコンテナの `min-w` + 水平スクロール（例: `ElevationProfile`）で担保する．

### 7. テキスト色

| 用途 | クラス |
|------|--------|
| 主要テキスト（見出し） | `text-gray-900` |
| 標準本文 | `text-gray-700` / `text-gray-800` |
| 補助テキスト（ラベル） | `text-gray-600` / `text-gray-500` |
| 無効/プレースホルダー | `text-gray-500` |
| 微弱テキスト | `text-gray-400` |

### 8. フォーカス・ディーセーブル状態

- shadcn/ui コンポーネントはデフォルトのフォーカスリング・disabled スタイルをそのまま使用する
- カスタム入力: `focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10`
- `focus-visible:ring-*` を `focus:ring-*` に置き換えない（キーボード操作のみを対象）
- 明示的な無効ボタン: `disabled:bg-blue-200 disabled:text-blue-100 disabled:cursor-not-allowed`

### 9. ローディング・空状態

- ローディング: `<LoadingSpinner text="〜中..." />`
- 空状態: 中央揃え + `text-gray-500` + `font-semibold`

### 10. エラー・アラート

| 種類 | 背景 | ボーダー | テキスト |
|------|------|----------|----------|
| 情報 | `bg-blue-50` | `border-blue-200` | `text-blue-900` |
| 警告 | `bg-orange-50` | `border-orange-300` | `text-orange-900` |
| エラー | `bg-red-50` | `border-red-300` | `text-red-700` |

**特別パレット:**
- 条件付き割引情報カード（リフト券計算結果の「条件を満たす場合の割引料金」）: `bg-purple-50` + `border-purple-200` + `text-purple-900`．「条件付き（未確定）の情報」を情報（青）・警告（橙）と区別するための第 4 色として許可

### 11. z-index の階層

アプリレベルの階層（この表の値以外を使用しない）:

| レベル | 値 | 用途 |
|--------|-----|------|
| 1 | `z-10` | ベースレイヤー（ワークスペース内の sticky ヘッダー等） |
| 2 | `z-20` | パネル内コントロール（閉じるボタン，エディタマップのタイル切替） |
| 3 | `z-30` | マッププレビューのオーバーレイコントロール |
| 4 | `z-40` | モーダル/オーバーレイのベース（予約） |
| 5 | `z-50` | ドロップダウン，ツールチップ（shadcn Positioner `isolate z-50`） |
| 6 | `z-[60]` | デスクトップ詳細パネル |
| 7 | `z-[100]` | 比較パネル（デスクトップ） |
| 7.5 | `z-[110]` | 空き（旧: 比較ボトムシートのドラッグストリップ。ボトムシート分支は削除済み） |
| 8 | `z-[150]` | モバイルトップバー |
| 9 | `z-[200]` | モバイル検索オーバーレイ |
| 10 | `z-[250]` | モバイル検索ボタン |
| 11 | `z-[260]` | 空き（旧: 比較アクションボタン。`CompareActionButton` は削除済み） |
| 12 | `z-[300]` | 拡大マップ / モバイル詳細パネル（最大） |

**マップローカルの z-index:**
- マップルートは `relative z-0` でスタッキングコンテキストを作り，Leaflet の内部ペイン（z 200–700）を閉じ込める．この閉じ込めを外すと，Leaflet ペインが `<main>` 内のモバイルトップバーやコントロールを覆う
- マップコントロール（ズーム，タイル切替等）はマップのスタッキングコンテキスト**内**で `z-[750]` を使用する（popup-pane の 700 より上）．これはマップローカルの値であり，上記のアプリレベル階層の制約には含まれない

### 12. モーダル・オーバーレイ

- 背景: モバイル検索 `bg-gray-50`，オーバーレイ `bg-black/10`
- パネル背景: 常に `bg-white`
- ボーダー: `border-gray-200`
- z-index: 上記 §11 の階層に従う

### 13. インタラクティブ要素

| 要素 | 指針 |
|------|------|
| Close ボタン | `X` アイコン + `strokeWidth={2.5}`，`variant="ghost"` + `border-gray-200` |
| FilterToggle 未選択 | `text-gray-500`，`border-gray-200` |
| FilterToggle 選択 | `text-white`，`bg-blue-600` |
| 下線タブ（DetailTabs / SkiResortCompareView） | 常時 `font-medium`，アクティブ時 `border-blue-600` + `text-blue-600` + `font-bold` |
| 塗りつぶしセグメントタブ（モバイルコンテキストヘッダ等） | アクティブ時 `bg-blue-600` + `text-white`，ウェイトは `font-semibold` |
| 戻るボタン | `ArrowLeft` + `variant="ghost"` + `text-gray-600` + `-ml-2` |

### 14. ホバー状態

| 要素 | 指針 |
|------|------|
| カード/テーブル行 | `hover:bg-gray-50` |
| ボタン | shadcn デフォルト |
| リンク | `hover:text-blue-700` |
| 選択行 | `hover:bg-blue-100` |
| SkiResortList デスクトップ hover（マップ hover 連動ハイライト） | `hover:md:border-blue-600 hover:md:shadow-md hover:md:-translate-y-0.5`（`md:` 限定でモバイルでは lift しない。マップ上のマーカー hover と同期させるため） |

### 15. レスポンシブ表示

**`hide-mobile` / `hide-desktop`（`globals.css`）:**
- `hide-mobile`: モバイルで非表示，≥768px で `display: flex !important`
- `hide-desktop`: モバイルで `display: flex`，≥768px で `display: none !important`
- `!important` で `display: flex` を強制するため，同一要素に Tailwind の `hidden` / `flex` / `md:flex` を併用しないこと（2 つの display 機構が競合する）．これらのクラスを要素の display 機構として単独で使用する
- 現状の使用: `hide-desktop` ×2 箇所（モバイル検索オーバーレイ，モバイルトップバー），`hide-mobile` ×0 箇所（予約）

**コンテナクエリ:**
- 天気比較パネル（`CompareWeatherTab`）は `@container weather-panel-container (max-width: calc(180px + 32px + 474px))`（= 686px）を唯一のレスポンシブ機構として使用する．ビューポートベースのクラス（`md:` 等）はパネルの実幅を反映しないため，このパネルには使用しない
- 閾値は行レイアウトの最小幅（info 上限 180px + `gap-8` 32px + feed 474px）と同期させること（`CompareWeatherTab.css` と `compare/constants.ts` のコメントに同期要件を明記済み）
- named query はコンテナ要素に `container-name: weather-panel-container` が必須（`container-type` だけでは非一致になる，F-7 参照）
- パネル内の表示制御（出典行・モバイルフッター等）は `CompareWeatherTab.css` のコンテナクエリが単一情報源．Tailwind の `hidden` クラスを付与しないこと（比較ビューの `.scrollable-tabs .hidden { display: contents !important }` に上書きされコンテナクエリが勝てなくなる，F-8 参照）
- 比較ビューの Tabs は `SkiResortCompareView` 側で `flex-col` を明示している（shadcn Tabs ベースクラスの `data-horizontal:flex-col` は dead class，F-9 参照）

**固定幅のレスポンシブ化:**
- 固定幅のサイドパネルは `w-[min(400px,50vw)]` のように `min()` で上限を設ける
- モバイル（320px-480px）でのボタン幅は `w-auto` + `min-w-*` を使用
- 編集ワークスペースのサイドバーは `lg:` で固定幅，それ以下では `min()` 相対幅（パターン A: `w-[min(480px,60vw)]` / `w-[min(460px,60vw)]`，パターン B: `w-[min(250px,40vw)]` / `w-[min(230px,40vw)]`．§18 参照）

**モバイル固定トップバー（HomeLayout）:**
- 検索ヘッダを含むトップバーは `position: fixed`（マップのフルブリード表示のため）．検索ヘッダ表示中はフロー内コンテンツをバー高さ（`4.6875rem + safe-area`）だけ `padding-top` でオフセットする（`HomeLayout.tsx` の `shouldShowMobileSearchButton` 条件付きクラス）
- バー高さを変更する場合は，`MobileSearchTopBarShell` の高さ・ラッパーの `pb-2`/`border-b`・このオフセット値の 3 箇所を同期させる
- 詳細・比較モードでは検索ヘッダが非表示になりバーが約 9px に縮むため，オフセットは付与しない（コンテキストヘッダが画面最上部に来る）

### 16. セクション見出し・スペーシング

`globals.css` に `section-heading`, `section-heading-sm`, `section-gap-*` を定義済み．`section-heading` は `ResortReviewSection.tsx`（レビューカテゴリ見出し）で使用済み．`section-heading-sm` と `section-gap-*` は未使用で，新規コンポーネント作成時に使用することを推奨．

**現状の共通パターン:**
```tsx
<h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">...</h2>
<h3 className="text-base text-gray-900 font-semibold">...</h3>
<div className="flex flex-col gap-6">...</div>
```

### 17. Admin ページ

- 背景: `bg-gradient-to-b from-gray-100 to-gray-200` — 単一情報源は `src/app/admin/layout.tsx`（`min-h-screen`）．ページ側で重複させない
- カード: `rounded-xl shadow-lg border-gray-200`（UserManagement，ツールリンク）
- ダッシュボード見出し: `text-2xl md:text-3xl font-bold text-gray-900`（ダッシュボードのみ）
- その他の Admin ページ見出し（login / no-access / logout）: `text-xl font-bold text-gray-900`
- AdminHeader: `bg-[var(--admin-dark)]` + `shadow-md` + `text-white`

### 18. 編集ワークスペース

2 カラムレイアウトの 2 パターンがある．新規編集ワークスペース作成時はどちらかに従う．

**パターン A: ライトサイドバー + 右側マップ（lift-edit, slope-edit）**

サイドバーはライト背景（ページ背景を継承）+ `border-r border-gray-200`．マップは `absolute inset-0` で配置し，**`left` オフセットは必ずサイドバー幅と一致させる**（不一致だと狭い幅で隙間が生まれる）．

```tsx
{/* サイドバー: lift w-[min(480px,60vw)] lg:w-[480px] / slope w-[min(460px,60vw)] lg:w-[460px] */}
<div className="flex h-full min-h-0 w-[min(480px,60vw)] lg:w-[480px] min-w-0 lg:min-w-[480px] flex-col border-r border-gray-200 p-4 gap-3 overflow-hidden">
  ...
</div>
{/* マップ: left はサイドバー幅と一致 */}
<div className="absolute inset-0 left-[min(480px,60vw)] lg:left-[480px]">
  <EditorMap ... />
</div>
```

**パターン B: ダークサイドバー（ticket-edit, review-edit）**

```tsx
<aside className="w-[min(250px,40vw)] lg:w-[300px] flex-shrink-0 bg-[var(--sidebar-dark)] text-white overflow-y-auto border-r border-white/20">
  <div className="p-5 sticky top-0 z-10 bg-[var(--sidebar-dark)]">
    ...
  </div>
</aside>
```

- サイドバー背景: `bg-[var(--sidebar-dark)]` (#102a43)
- サイドバーテキスト: `text-white`
- サイドバーボーダー: `border-r border-white/20`
- サイドバー幅: ticket `w-[min(250px,40vw)] lg:w-[300px]`，review `w-[min(230px,40vw)] lg:w-[280px]`（lg 未満は 40vw 上限で，メインのエディタに幅を回す）
- メインエリア: `bg-white` または `bg-gray-50`
- トレードオフ: 480px 未満ではメインのエディタが狭くなる（管理ツールはデスクトップ中心と判断し，縦積みレイアウトにはしない）

**共通:**
- ヘッダー: `flex flex-wrap items-center gap-x-4 gap-y-1`（狭い幅で折り返す）

### 19. インラインスタイルの制限

**原則:** Tailwind クラスで表現可能なスタイルは `className` で記述する．

**許可されるインラインスタイル:**
- 動的な値（`width: ${value}%`, `paddingBottom: ${calc}px`）
- `safe-area-inset-*` の計算
- Leaflet マーカーの `zIndex`
- 動的 `gridColumn`
- ベンダープレフィックス（`MozAppearance` など）

**禁止:**
- 固定値の `fontSize`, `color`, `backgroundColor` を `style` で指定
- Tailwind で表現可能な `padding`, `margin`, `borderRadius` を `style` で指定
- ランタイムに組んだ Tailwind アービトリリクラス（例: `text-[${value}]`）— Tailwind JIT はリテラル文字列のみから生成するため，動的な色等は `style` で指定する

**ライブラリが注入する CSS の上書き:**
ライブラリがランタイムに注入する CSS は同一特異度の Tailwind クラスに勝つことがある．上書きはインラインスタイルではなく，スコープ付きの `globals.css` ルールで記述する．

### 20. マップ関連のスタイル

Leaflet コンポーネントのスタイルは `globals.css` の `html body .xxx` セレクターで一元管理する．

- マーカー: `.resort-point-marker`
- ラベル: `.resort-name-label`, `.finalized-course-name-label`（`position: absolute`）, `.finalized-lift-name-label`（`position: absolute`）
- タイルバリエーション切り替え: `data-map-tile-variant` 属性で制御
- マップコントロール: globals.css ではなくコンポーネント側の Tailwind クラス（`absolute left-4 z-[750]` 等，§11 のマップローカル値）

### 21. globals.css のその他ユーティリティ

各セクションで言及したユーティリティ（`table-*`, `card-subtle` / `card-elevated`, `section-*`, `hide-mobile` / `hide-desktop`）の他に，以下が使用されている:

| ユーティリティ | 用途 |
|------|------|
| `scroll-touch` | iOS のスムーズスクロール（`-webkit-overflow-scrolling: touch`） |
| `tap-highlight-transparent` | iOS のタップハイライト無効化 |
| `backdrop-none` | `backdrop-filter` を none に上書き（`!important`） |
| `transition-smooth` | インタラクティブ要素用の 150ms トランジション |
| `ruby-text` | ルビ（ふりがな）テキストのレイアウト |

定義済み・現在未使用: `border-subtle`, `focus-ring`, `truncate-1`, `truncate-2`, `safe-top`, `safe-bottom`, `pb-safe-bottom`, `scrollable-tabs`（運用メモの `card-*` / `panel-*` / `section-gap-*` に加える）．新規コンポーネントでは使用しないこと．

`scrollable-tabs` について: `.scrollable-tabs .hidden { display: contents !important }` はクラス選択子だが，base-ui の TabsPanel は非アクティブパネルを `hidden` **属性**で隠すため TabsContent には一致しない．2026-08-16 時点でこの rule に一致する要素は 0 件（天気パネルのモバイルフッターが CSS 表示制御に移行したため，F-8 参照）．

## 未対応・今後の課題

2026-08-15 の全ページ敵対的監査（7 ドメイン + マルチビューポート検証）で発見したスタイリング違反は全件修正済み．加えて，監査中に発見したモバイルの行動系不具合 2 件も修正した:

- HOME-COMP-2: 未検索状態で比較セットを構築してもモバイルに比較ビューを開くエントリがなかった（デスクトップは `compareCount > 0` で常時表示）．`shouldShowMobileContextHeader` に `compareCount > 0` 条件を追加し，デスクトップと揃えた
- HOME-19: 固定トップバー（フロー外）の高さ分だけフロー内コンテンツが隠れていた（検索結果ヘッダ・リスト先頭）．検索ヘッダ表示中に `padding-top` でオフセット（§15 参照）

2026-08-15〜16 の後続作業で，別提案 SUG-1〜SUG-3 / SUG-5〜SUG-8 を解決した:

- SUG-1: `sheetSnapPoint` デッドチェーン（HomeClient の `detailSheetSnapPoint` 状態 → HomeLayout → `SkiResortDetailView` の props）を除去．`selectedViewportBottomPaddingRatio` は home 側で常に 0（モバイルでは詳細とマップが同時描画されない）のため，HomeClient 側の計算・渡しを含め削除した（マップコンポーネント側の API は維持）
- SUG-2: `MobileSearchButton` の `placement` / `isHidden` デッドプロパティを除去（単一呼び出し元で固定値のみ使用）
- SUG-3: `CompareActionButton`（デッドコード）を削除し，関連する snap point 定数を除去
- SUG-5: §13 のタブ規則を明確化（下線タブは常時 `font-medium` + アクティブ時 `font-bold`，塗りつぶしセグメントタブは `font-semibold`）．`SkiResortCompareView` のタブを `DetailTabs` と同じパターンに統一
- SUG-6: home ドメインのデッドコード（`BOTTOM_SHEET_MAP_PEEK_HEIGHT` 等の定数，`restoreDocumentPointerEvents` / `scheduleRestoreDocumentPointerEvents`）を除去．`useHomeGestureGuards` の該当 effect と未使用になった `selectedResortId` オプションも同時に除去
- SUG-7: 詳細・比較を閉じた際のタブ復帰を実装（`closeMobileContentTab`）．開く前にリストシートが閉じていた場合（マップから開いた場合）はマップタブへ戻り，コンテンツエリアの白抜きを解消
- SUG-8: `isLiftTicketFilterActive` ヘルパーを新設し，`getActiveFilterLabels` と `isFilterActive` で共有．デフォルトリフト券入力を「フィルタ適用中」として数えなくなったため，未検索状態の「リフト券」バッジ表示を解消
- SUG-9: 共有コンポーネント `src/components/ui/tabs.tsx` の dead orientation バリアント（`data-horizontal:flex-col` ほか `group-data-horizontal/tabs:*` / `group-data-vertical/tabs:*` 全件）を除去（F-C8 参照）

2026-08-16 の全ページ敵対的再監査（全ドメインの静的監査 + 7 ビューポート × 12 ページ状態の動的スウィープ）で発見した違反を修正した:

- F-1 (§17): admin の login / no-access / logout ページが `bg-gradient-to-b from-gray-100 to-gray-200` を重複指定していたため，ページ側を除去（単一情報源は `src/app/admin/layout.tsx`）
- F-2 (§15): `CompareWeatherTab` 外側グリッドの gap 分岐をビューポートベースの `md:` クラスから表示形態（`isSidePanel`）ベースに変更
- F-3 (§15): `ResortWeatherPanel` の `md:pb-8` は `isSidePanel=false` 分岐（`md:` が発火しない <768px）にのみ存在する到達不能なデッドクラスだったため除去
- F-4 (§15): `CompactSnowForecastEmbed` の出典行（`.snow-forecast-desktop-source`）がコンテナクエリと `hidden md:block` を併用し，678〜768px 域で wide モードなのに出典行だけが非表示になる状態を解消．表示制御はコンテナクエリ（`CompareWeatherTab.css`）のみに集約
- F-5 (§13): モバイル検索ヘッダの地図 / リスト塗りつぶしセグメントタブに `font-semibold` を付与（比較タブと同一）
- F-6 (機能バグ): `MobileSearchOverlay` の `scrollPaddingTop` が `${MOBILE_SEARCH_TOP_BAR_HEIGHT}px` として単位を付加していたが，この定数は `calc()` 完結の値のため `calc(...)px` という不正 CSS が生成され宣言が破棄されていた．単位付加を除去
- F-7 (§15): 天気比較パネルのコンテナクエリが**一度も発火していなかった**．`@container weather-panel-container (...)` は named query だが，`.weather-panel-container` に `container-name` が設定されておらず常に非一致だった．`container-name: weather-panel-container` を追加．これにより 678px 閾値（後日 F-C3 で 686px に修正）の narrow/wide 切り替えが初めて実効になった
- F-8 (§15): `.snow-forecast-mobile-footer` が Tailwind の `hidden` クラスを使用していたが，比較ビューの `.scrollable-tabs .hidden { display: contents !important }` に上書きされ，コンテナクエリの `display: flex`（narrow モード）が `!important` に勝てず常に `display: contents` だった（フッターの子要素が wide モードでも漏れ表示されていた）．`hidden` クラスを除去し，表示制御を `CompareWeatherTab.css` のベース rule（`display: none`）+ コンテナクエリ（`display: flex`）のみに集約
- F-9 (レイアウトバグ): 比較ビューの Tabs が**全幅で横並びレイアウト**になっていた．shadcn Tabs ベースクラスの `data-horizontal:flex-col` は Tailwind v4 の `data-horizontal:` バリアントが `[data-horizontal]` 属性を要求する一方，base-ui Tabs Root が付与するのは `data-orientation="horizontal"` 属性のみであるため常に非一致（dead class）で，flex-direction が row のままだった（タブバーとコンテンツが横並び）．`SkiResortCompareView` の Tabs に `flex-col` を明示．共有コンポーネント（`tabs.tsx`）の dead class 自体の修正は別提案（SUG-9）とする

2026-08-16 の第 2 回全ページ敵対的再監査（全ドメインの静的監査 + 320px〜1920px のマルチビューポート検証）で発見した違反を修正した:

- F-H1 (§15): `SkiResortList` の比較トグルボタンが `md:w-[100px]` 固定幅で，選択状態の「比較から外す」（アイコン + 6 文字 + padding ≒ 108px）が 8px 溢れて `whitespace-nowrap` でクリップされていた．`w-auto` + `md:min-w-[100px]` に変更（未選択時は 100px 維持，選択時は内容幅に拡張）
- F-W1 (§15): `TicketPartyEditor` のカテゴリ Select が 320〜360px で溢れていた（SelectTrigger の `w-fit` + `whitespace-nowrap` と最長ラベル「大学・専門学生」≒ 122px が grid の 1fr セル幅 78px を超過）．`w-full` + SelectValue `min-w-0 truncate` に変更
- F-W2 (§4): `LiftTicketPriceTable` の対象者列ヘッダーの `text-right` が dead class（unlayered の `.table-header-cell` の `text-align: left` が常に勝つ）で，ヘッダーが左揃え・本文が右揃えになっていた．インライン `style={{ textAlign: "right" }}` で右揃え
- F-W3 (§10/§7): `TicketCalculationCard` が partial 状態で `destructive` バリアントを使用し，その `*:data-[slot=alert-description]:text-destructive/90`（具体度 (0,2,0)）が注記の `text-gray-600` を上書きして橙色カード上で注記が赤字になっていた．`variant="default"` を固定（背景・ボーダー・タイトルは className で指定済み）
- F-W4 (§10): `TicketPlanCard` の合計ボックス `bg-amber-50` → `bg-orange-50`（警告階層の統一）
- F-W6 (§9): `TicketCalculationCard` の空状態 Alert に `text-center` を付与
- F-W7 (§9): `TicketPlanCard` の空状態 CardContent に `text-center` を付与
- F-W8 (§16): `ResortReviewSection` の h2 `text-xl` → `text-lg`（§16 パターンと隣接タブとの統一）
- F-W9 (§15): WeatherChart の標高選択ボタン `w-[5rem] md:w-[6rem]` → `w-auto min-w-[5rem] md:min-w-[6rem]`（ラベルは 2 文字のため視覚不変，堅牢化）
- F-W10 (§14): `SourceMarks` の `[1]` マークと出典リストタイトルリンクに `hover:text-blue-700` を付与
- F-W11 (§19): `LiftTicketPriceTable` の dead class `col-span-` を除去（実際の colspan は `style={{ gridColumn }}`）
- F-C1 (§15, high): `CompactSnowForecastEmbed` のモバイルフッターが最小幅 360px（3 ボタン `px-8` + `gap-8`×2 + `p-4`）で，narrow モードの利用可能幅（コンテナ − 100px）を超過し，320〜480px とデスクトップ側パネル（768〜968px ビューポート）で「山麓」ボタンと出典テキストがクリップされていた．ボタンを `px-4 py-2`，フッターを `gap-4` + `flex-wrap`，出典テキストを `min-w-[12rem]`（幅不足で 2 行目に折り返す）に変更
- F-C2 (§15): 同フッターの区切り線に `flex-1` が付いており `w-px` を無視（flex-basis: 0% が優先）して 26〜144px の灰色バーになっていた．`flex-shrink-0` に変更
- F-C3 (§15): コンテナクエリ閾値 `calc(180px + 8px + 474px + 16px)`（678px）が行レイアウトの実最小幅（180 + `gap-8` 32 + 474 = 686px）と 8px ずれており，678〜686px 帯で行が最大 8px 溢れてクリップされていた．`calc(180px + 32px + 474px)` に同期（`CompareWeatherTab.css` と `constants.ts` のコメントも同期）
- F-C4 (§15): block 要素 `.weather-panel-container` の dead `gap-8` と冗長な `gap-0` を除去
- F-C5 (§11/§3): `SkiResortCompareView` の vaul ボトムシート分支が到達不能だった（モバイルは `presentation="inline"`，デスクトップは ≥768px のみで描画）．`useMediaQuery` が `false` で初期化されるため初回レンダの 1 フレームのみ描画されボトムシートのちらつきになっていた．分支と関連の snap point 状態・スクロール意図ハンドラ・`onContentScrollIntent` prop を除去し，不要になった globals.css の `[data-ski-resort-compare-panel] [data-vaul-handle]` ルールも除去（§11 の z-[110]/z-[200] エントリと §3 のカスタムシャドウエントリを同期）
- F-C6 (§6): `CompareOverviewTab` の数値セルを見出しフォントから `font-mono` に変更（桁揃え）
- F-C7 (§5): `CompareLiftTicketTab` の情報カードの `rounded-2xl` を除去（同ビューの他カードと `rounded-xl` に統一）
- F-C8 (§15/SUG-9): `tabs.tsx` の dead orientation バリアント（`group-data-horizontal/tabs:*`，`group-data-vertical/tabs:*` — base-ui は `data-orientation` 属性のみを付与するため `data-horizontal`/`data-vertical` 属性セレクタは常に非一致）を全件除去．アプリに縦タブが存在せず，2 つの利用箇所（SkiResortCompareView / DetailTabs）は明示的な上書きを持つため表示影響なし
- F-PB1 (§15/§18): パターン B ワークスペース（ticket-edit / review-edit）のサイドバーが lg 未満で固定幅（250/230px）のため，320px でメインのエディタに 70〜90px しか残っていなかった．40vw 上限を付与（`w-[min(250px,40vw)]` / `w-[min(230px,40vw)]`，パターン A と同じく `lg:` で固定幅に復帰）
- F-PB2 (§18 共通): ワークスペースのヘッダーが指針で求められる `flex-wrap` を欠き，320px でアクションボタンがルートの `overflow-hidden` でクリップされていた．`flex-wrap` + `gap-x`/`gap-y` を付与（ticket ヘッダーのアクショングループにも `flex-wrap` + `gap-3 lg:gap-12`）

2026-08-16 の第 3 回敵対的監査（shadcn/ui 共有コンポーネント `src/components/ui/` 全 32 種の `data-*` バリアントを base-ui 実装と突合）で発見した違反を修正した:

- F-U1 (表示バグ): `separator.tsx` の `data-horizontal:`/`data-vertical:` バリアントが死クラスだった．base-ui Separator は `data-orientation="horizontal|vertical"` 属性のみを付与し `data-horizontal`/`data-vertical` 属性は存在しないため，寸法クラス（`h-px`/`w-full` 等）が一切効かず separator が**高さ 0 で不可視**になっていた．`WeatherChart` と `MapControls` で使用されているため実際の表示バグ．`data-[orientation=horizontal]:`/`data-[orientation=vertical]:` に変更
- F-U2 (表示バグ): `scroll-area.tsx` の ScrollBar が同様の死バリアント（`data-horizontal:`/`data-vertical:`）を使用し，スクロールバーの寸法クラスが効かず表示が壊れていた（コンテンツ自体は Viewport 経由でスクロール可能）．lift/slope の DetailStep / GeometryStep / DetailEditStep で複数使用．`data-[orientation=...]:` に変更
- F-U3 (dead class): `tooltip.tsx` の `data-[state=delayed-open]:` ×3 が死クラスだった．base-ui Tooltip Popup は `data-open`/`data-closed` 属性のみを付与し `data-state` を付与しないため常に非一致（かつ動く `data-open:` と冗長）．除去（挙動中立）

同監査で確認し**違反と判定しなかった**もの（将来の再点検防止のため記録）:

- `select.tsx` の `data-[align-trigger=true]:animate-none` は**生きたクラス**．shadcn ラッパーが `data-align-trigger={alignItemWithTrigger}`（boolean prop）を明示付与し，React が `"true"`/`"false"` に文字列化するため `alignItemWithTrigger={true}` 時に正しく発火する（base-ui state 属性の空値付与とは異なる経路）
- `label.tsx` の `group-data-[disabled=true]:` は base-ui Field が `data-disabled` を空値属性で付与するため死んでいる可能性があるが，`peer-disabled:opacity-50 cursor-not-allowed` が同じスタイルを担保しており表示バグではない（shadcn 標準パターンとして維持）
- `table.tsx` の `data-[state=selected]:bg-muted` は素の HTML `<table>`（base-ui primitive 非使用）における shadcn 標準の選択行フックであり，バグではない
- `drawer.tsx`（base-ui 版 Drawer）はアプリ内で**未使用**（vaul 版 Drawer の唯一の利用箇所を F-C5 で削除した後に残存）．`data-[modal=true]` / `data-[swipe-axis=...]` 等の死バリアントを有するが未使用のため潜在的影響のみ（SUG-13 参照）

別提案（今回の監査で発見した未対応の改善候補）:

- SUG-10: `CompactSnowForecastEmbed` の iframe 初期スクロール位置が `window.matchMedia("(min-width: 48em)")`（ビューポートベース）で分岐している．768〜968px 域ではコンテナクエリが narrow モードなのにデスクトップ用オフセットが適用される（ユーザースクロールで自己修正するため軽微）．コンテナクエリベースへの置換，またはオフセット自体の廃止を推奨
- SUG-11 (機能系・スタイリング外): 開発環境で間欠的に `Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component.` という React 19 dev-mode 警告が発生する．マルチビューポートスウィープ（84 状態）で実行ごとにランダムな状態（plain な home-map 読み込みや admin-no-access を含む）に 4〜13 件出現し，本監査のスタイリング変更（CSS・className のみ）とは無関係と判断した．render 関数内の非同期 setState を伴うサイドエフェクトが原因で，本番ビルドでは表示されない dev-only チェックである．該当コンポーネントの特定（React DevTools 等による調査）と修正を推奨
- SUG-12: vaul（`Drawer`）の唯一の利用箇所だった `SkiResortCompareView` のボトムシート分支を削除したため（F-C5），`vaul` 依存が未使用になった．`pnpm remove vaul` で依存を除去することを推奨（lockfile 更新を伴うため本監査では未実施）
- SUG-13: `src/components/ui/drawer.tsx`（base-ui 版 Drawer）が未使用（vaul 版 Drawer の唯一の利用箇所を F-C5 で削除した後に残存）．`data-[modal=true]` / `data-[swipe-axis=...]` 等の死バリアントを有するが未使用のため潜在的影響のみ．base-ui Drawer を使う予定があれば死バリアントを base-ui 実属性（`data-expanded` 等）に修正し，使わない場合は SUG-12 と併せて未使用コンポーネント・依存の整理を検討

以下は維持する結論のトレードオフ記録であり，未対応ではない:

- SUG-4: マップの `autoPan={false}`（パンを有効にすると複数タップの比較選択が壊れるため維持）

**運用メモ:**
- globals.css は biome の処理対象から除外（Tailwind 4 構文の parse 非対応を回避）
- `card-*`, `panel-*`, `section-gap-*` はセマンティックエイリアスとして定義維持．新規コンポーネント作成時に使用する

## 関連

- [[Chakra UI → shadcn/ui 移行計画]](p0001_migrate_to_shadcn_ui.md) — 本指針は移行完了後の後続作業
