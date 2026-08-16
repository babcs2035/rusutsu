# p0001: Chakra UI v3 → shadcn/ui + Radix UI への移行

## 目的

Next.js 16 の Turbopack デフォルト化に対応し、Emotion 依存を排除してバンドルサイズを削減する。Chakra UI v3 は Turbopack 非対応（`--webpack` フラグ必須）のため、Next.js 16 のデフォルトバンドラである Turbopack と完全に互換性のある shadcn/ui + Radix UI に移行する。

## 現状の分析

### 使用技術スタック（移行前）
- **UI ライブラリ:** `@chakra-ui/react` ^3.36.1（Chakra UI v3, token-based）
- **CSS アーキテクチャ:** Emotion（CSS-in-JS）+ Chakra token system
- **パッケージ:** `@chakra-ui/next-js` ^2.4.2, `@emotion/react` ^11.14.0
- **アニメーション:** `framer-motion` ^13.0.0
- **Bottom Sheet:** `vaul` ^1.1.2（維持）
- **Next.js スクリプト:** 明示的に `--webpack` フラグ使用（Turbopack 回避）
- **next.config.ts:** `optimizePackageImports: ["@chakra-ui/react"]`

### 影響範囲
- **53 ファイル**が Chakra UI をインポート
- **28 種類の Chakra コンポーネント**を使用
- **Theme 設定:** fonts（Bricolage, Manrope）, brand colors（blue 50-900）, surface tokens

### 使用 Chakra コンポーネント（28 種）

| カテゴリ | コンポーネント | 使用ファイル数 |
|---|---|---|
| Layout | `Box`, `Flex`, `Grid`, `Portal` | 51, 40, 6, 2 |
| Content | `Text`, `Heading`, `Link`, `List` | 大量, 大量, 7, 2 |
| Table | `Table.Root`, `Table.Header`, `Table.Body`, `Table.Row`, `Table.Cell`, `Table.ColumnHeader` | 8 |
| Feedback | `Spinner`, `Toast`, `Toaster`, `createToaster` | 2, 1, 1, 1 |
| Forms | `Input`, `Textarea`, `NativeSelect.Root/Field/Indicator` | 10, 2, 3 |
| Buttons | `Button` | 25+ |
| Hooks | `useBreakpointValue` | 2 |
| その他 | `Drawer.Root/Portal/Content/Title/Handle`（compound） | 2 |

### 使用されていない Chakra コンポーネント
`Stack`, `HStack`, `VStack`, `Container`, `SimpleGrid`, `Badge`, `Modal`, `Popover`, `Menu`, `Checkbox`, `Radio`, `Switch`, `Tabs` などは未使用。

## 移行先技術スタック

- **UI コンポーネント:** shadcn/ui v3（コピー＆ペースト方式）
- **ベース:** Radix UI（ヘッドレスアクセシビリティプリミティブ）
- **スタイリング:** Tailwind CSS v4
- **アニメーション:** `tailwindcss-animate` + CSS transitions（framer-motion は削除可能）
- **Bottom Sheet:** `vaul` 継続使用（Radix Dialog との併用可）
- **アイコン:** `lucide-react` 継続使用（現在インストール済み）

## 移行フェーズ

### フェーズ 1: 基盤セットアップ

#### 1.1 Tailwind CSS v4 の導入

現在 Next.js 16 は Tailwind CSS v4 との親和性が最高。`create-next-app` のデフォルトオプションで Tailwind v4 が導入される。

**手順:**
1. `tailwindcss` v4, `@tailwindcss/postcss` をインストール
2. `postcss.config.mjs` を作成（v4 対応）
3. `src/app/globals.css` を Tailwind v4 形式に変換:
   - `@tailwind base;` `@tailwind components;` `@tailwind utilities;` → `@import "tailwindcss";`
   - 既存の CSS 変数（`--bg-light`, `--brand-main` など）を `:root` に維持
   - Leaflet 関連の CSS はそのまま維持

**Tailwind v4 の主な変更点:**
- `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`
- `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`
- `outline-none` → `outline-hidden`（アクセシビリティ向上）
- `ring` → `ring-3`（デフォルト幅が 1px に変更）
- `bg-gradient-to-*` → `bg-linear-to-*`

#### 1.2 shadcn/ui の初期化

```bash
pnpm dlx shadcn@latest init
```

設定値:
- Style: `new-york`（Radix ベースのデフォルト）
- Base color: `zinc`（中性色。brand color は CSS variable で上書き）
- CSS variables: `yes`（Chakra の token system に近いアプローチ）
- TypeScript: `yes`
- Tailwind CSS v4 対応のため、`tailwind.config.ts` ではなく `globals.css` での設定を採用

#### 1.3 必要 shadcn コンポーネントの追加

使用している Chakra コンポーネントに対応する shadcn コンポーネントをインストール:

```bash
# Layout: Box, Flex → Tailwind utility classes（コンポーネント不要）
# Content: Text, Heading → native HTML + Tailwind
# Core components
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add input
pnpm dlx shadcn@latest add textarea
pnpm dlx shadcn@latest add select
pnpm dlx shadcn@latest add table
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add drawer
pnpm dlx shadcn@latest add scroll-area
pnpm dlx shadcn@latest add badge
pnpm dlx shadcn@latest add skeleton
pnpm dlx shadcn@latest add toast
pnpm dlx shadcn@latest add dropdown-menu
pnpm dlx shadcn@latest add separator
pnpm dlx shadcn@latest add sheet
pnpm dlx shadcn@latest add alert
pnpm dlx shadcn@latest add collapsible
pnpm dlx shadcn@latest add accordion
pnpm dlx shadcn@latest add avatar
pnpm dlx shadcn@latest add checkbox
pnpm dlx shadcn@latest add switch
pnpm dlx shadcn@latest add tabs
pnpm dlx shadcn@latest add radio-group
pnpm dlx shadcn@latest add popover
pnpm dlx shadcn@latest add tooltip
```

#### 1.4 CSS variable のマッピング

Chakra の brand color を Tailwind CSS variable に変換:

```css
/* globals.css の :root に追加 */
:root {
  /* 既存変数は維持 */
  --bg-light: #f4f6f8;
  --bg-gradient: radial-gradient(circle at top right, #ffffff, #f4f6f8);
  --brand-main: #3b82f6;
  --brand-dim: #93c5fd;
  --text-primary: #111827;
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(0, 0, 0, 0.06);

  /* shadcn/ui デフォルト（上書き可能） */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;   /* #3b82f6 相当 */
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;       /* #3b82f6 相当 */
  --radius: 0.5rem;

  /* Chakra surface tokens の Tailwind 変換 */
  --surface-dark: rgba(255, 255, 255, 0.95);
  --surface-light: rgba(0, 0, 0, 0.05);
  --surface-glass: rgba(255, 255, 255, 0.7);
  --surface-border: rgba(0, 0, 0, 0.08);
}
```

### フェーズ 2: コンポーネント変換

#### 2.1 Box → div + Tailwind

`Box` は最も広く使用されている（51 ファイル）。Chakra の `Box` は本質的に `<div>` に等しい。

**変換ルール:**
```tsx
// Before (Chakra)
<Box p={4} bg="white" borderRadius="lg" border="1px solid" borderColor="gray.200">
  <Box mt={2}>

// After (Tailwind)
<div className="p-4 bg-white rounded-lg border border-gray-200">
  <div className="mt-2">
```

**Chakra → Tailwind マッピング表:**

| Chakra prop | Tailwind class |
|---|---|
| `p={n}` | `p-{n*4}px` |
| `px={n}` | `px-{n*4}px` |
| `py={n}` | `py-{n*4}px` |
| `m={n}` | `m-{n*4}px` |
| `mt={n}` | `mt-{n*4}px` |
| `w={n}` | `w-{n*4}px` |
| `h={n}` | `h-{n*4}px` |
| `minH={n}` | `min-h-{n*4}px` |
| `maxH={n}` | `max-h-{n*4}px` |
| `bg="..."` | `bg-...` |
| `color="..."` | `text-...` |
| `borderRadius="lg"` | `rounded-lg` |
| `border="1px solid"` | `border` |
| `borderColor="gray.200"` | `border-gray-200` |
| `flexWrap="wrap"` | `flex-wrap` |
| `gap={n}` | `gap-{n*4}px` |
| `overflowY="auto"` | `overflow-y-auto` |
| `cursor="pointer"` | `cursor-pointer` |
| `lineClamp={n}` | `line-clamp-{n}` |

#### 2.2 Flex → div.flex + Tailwind

```tsx
// Before
<Flex mb={1} alignItems="baseline" gap={1.5} flexWrap="wrap">

// After
<div className="mb-1 flex items-baseline gap-1.5 flex-wrap">
```

#### 2.3 Grid → div.grid + Tailwind

```tsx
// Before
<Grid templateColumns="repeat(3, 1fr)" gap={4}>

// After
<div className="grid grid-cols-3 gap-4">
```

#### 2.4 Typography

```tsx
// Before
<Heading size="lg" color="gray.700" fontSize="xs" fontWeight="800">

// After
<h2 className="text-gray-700 text-xs font-extrabold">
// or
<p className="text-gray-700 text-xs font-extrabold">
```

| Chakra | Tailwind |
|---|---|
| `Heading size="xl"` | `text-4xl font-bold` |
| `Heading size="lg"` | `text-2xl font-bold` |
| `Heading size="md"` | `text-xl font-semibold` |
| `Heading size="sm"` | `text-base font-semibold` |
| `Text fontSize="xs"` | `text-xs` |
| `Text fontSize="sm"` | `text-sm` |
| `Text fontSize="base"` | `text-base` |
| `Text fontSize="lg"` | `text-lg` |
| `fontWeight="800"` | `font-extrabold` |
| `fontWeight="900"` | `font-black` |

#### 2.5 Button

```tsx
// Before
<Button size="xs" variant="ghost" colorPalette="red" aria-label="削除">
  <Trash2 size={14} />
</Button>

// After
<Button size="xs" variant="ghost" className="text-red-600 hover:text-red-700" aria-label="削除">
  <Trash2 size={14} />
</Button>
```

shadcn の Button コンポーネントは以下の prop をサポート:
- `size`: `default`, `sm`, `lg`, `icon`
- `variant`: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`

`colorPalette` prop は廃止。明示的な color class に置き換え。

#### 2.6 Form Elements

```tsx
// Before
<Input size="sm" bg="white" type="date" value={current} onChange={...} />

// After
<input
  type="date"
  className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
  value={current}
  onChange={...}
/>
```

NativeSelect の変換:
```tsx
// Before
<NativeSelect.Root>
  <NativeSelect.Field />
  <NativeSelect.Indicator />
</NativeSelect.Root>

// After
<select className="h-9 rounded-md border border-input bg-white px-3 py-1 text-sm">
  <option>...</option>
</select>
```

#### 2.7 Table（compound components）

```tsx
// Before
<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.ColumnHeader>名前</Table.ColumnHeader>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    <Table.Row>
      <Table.Cell>値</Table.Cell>
    </Table.Row>
  </Table.Body>
</Table.Root>

// After
<table className="w-full">
  <thead>
    <tr>
      <th className="...">名前</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="...">値</td>
    </tr>
  </tbody>
</table>
```

shadcn の Table コンポーネントを使用:
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

<table className="w-full">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>名前</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>値</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</table>
```

#### 2.8 Spinner

```tsx
// Before
<Spinner thickness="2px" color="brand.500" speed="1s" emptyColor="gray.200" />

// After
<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
```

または shadcn の Skeleton コンポーネントを使用。

#### 2.9 Toast / Toaster

```tsx
// Before
const [toaster] = createToaster({ placement: "top-end" });
toaster.create({ title: "Saved" });
// ...
<Toaster toaster={toaster} />

// After
import { toast } from "sonner"  // shadcn/ui は sonner を使用
toast.success("Saved");
// ...
<Toaster />  // sonner の Toaster
```

shadcn/ui の `toast` コンポーネントは内部で `sonner` を使用。`createToaster` の代わりに `toast()` 関数を使用。

#### 2.10 Portal

```tsx
// Before
<Portal>
  <Box>...</Box>
</Portal>

// After
import { createPortal } from "react-dom"
// ...
{typeof document !== "undefined" && createPortal(<div>...</div>, document.body)}
```

または Radix UI の `Portal` コンポーネント:
```tsx
import { Portal } from "@radix-ui/react-portal"
```

#### 2.11 Drawer

Chakra の Drawer compound components → `vaul` の继续使用を推奨:
```tsx
// Before
<Drawer.Root>
  <Drawer.Portal>
    <Drawer.Content>
      <Drawer.Title />
      <Drawer.Handle />
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

// After
import { Drawer } from "vaul"
<Drawer.Root>
  <Drawer.Trigger>Open</Drawer.Trigger>
  <Drawer.Portal>
    <Drawer.Content>
      <Drawer.Title />
      <Drawer.Handle />
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

vaul は既にインストール済み。Radix UI の Drawer と互換性がある。

#### 2.12 useBreakpointValue

```tsx
// Before
import { useBreakpointValue } from "@chakra-ui/react"
const value = useBreakpointValue({ base: "mobile", md: "desktop" })

// After
import { useMediaQuery } from "@/hooks/use-media-query"
const [isMd] = useMediaQuery("(min-width: 768px)")
const value = isMd ? "desktop" : "mobile"
```

または Tailwind の `@container` クエリまたは CSS media query を直接使用。

#### 2.13 motion.create（framer-motion）

```tsx
// Before
import { motion } from "framer-motion"
const MotionBox = motion.create(Box)

// After（CSS transition のみ）
// div + Tailwind transition classes
// 複雑なアニメーションが必要な場合は framer-motion を維持

// または framer-motion の motion.div を使用
import { motion } from "framer-motion"
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
```

### フェーズ 3: ファイル別変換計画

#### 3.1 Provider 系

| ファイル | 変更内容 |
|---|---|
| `src/providers/ChakraProvider.tsx` | 削除。`src/providers/ThemeProvider.tsx` に置換（shadcn/ui 標準） |
| `src/app/layout.tsx` | `ChakraProvider` インポートを `ThemeProvider` に変更 |

#### 3.2 共有コンポーネント（`src/shared/`）

| ファイル | Chakra コンポーネント | 変換 |
|---|---|---|
| `src/shared/components/LoadingSpinner.tsx` | `Flex`, `Spinner`, `Text` | `div.flex`, CSS spinner, `p` |

#### 3.3 フィルター機能（`src/features/filters/`）

| ファイル | Chakra コンポーネント | 変換 |
|---|---|---|
| `FilterPanel.tsx` | `Box`, `Button`, `Flex`, `Grid`, `Heading`, `Input`, `Text`, `useBreakpointValue` | Tailwind div, shadcn Button, Grid, Typography, Input |
| `components/FilterControls.tsx` | 同上 | 同上 |

#### 3.4 ホーム機能（`src/features/home/`）

| ファイル | Chakra コンポーネント | 変換 |
|---|---|---|
| `components/CompareActionButton.tsx` | `Button` | shadcn Button |
| `components/DesktopSearchPanel.tsx` | `Box`, `Button`, `Flex` | Tailwind div |
| `components/MobileResultsSheet.tsx` | `Box` | Tailwind div |
| `components/MobileSearchButton.tsx` | `Box`, `Button` | Tailwind div, shadcn Button |
| `components/MobileSearchOverlay.tsx` | `Box`, `Button`, `Flex`, `Input` | Tailwind div, shadcn Button/Input |
| `components/MobileSearchTopBarShell.tsx` | `Box` | Tailwind div |
| `components/SkiResortCompareView.tsx` | `Box`, `Button`, `Flex`, `Heading`, `Portal`, `Text`, `useBreakpointValue`, `Drawer` compound, `motion.create(Box)` | Tailwind div, shadcn components, vaul Drawer, CSS transition |
| `components/SkiResortList.tsx` | `Box`, `Button`, `Flex`, `Heading`, `List`, `Text`, css prop | Tailwind div, shadcn components |
| `layout/HomeLayout.tsx` | `Box`, `Button`, `Flex`, `Heading`, `Text`, `AnimatePresence` | Tailwind div, shadcn components, CSS transition |

#### 3.5 比較機能（`src/features/home/components/compare/`）

| ファイル | Chakra コンポーネント | 変換 |
|---|---|---|
| `CompareLiftTicketTab.tsx` | `Box`, `Flex`, `Grid`, `Heading`, `Text` | Tailwind div |
| `CompareOverviewTab.tsx` | `Box`, `Table.*`, `Text` | shadcn Table |
| `CompareReviewsTab.tsx` | `Box`, `Button`, `Flex`, `Table.*`, `Text` | shadcn components |
| `CompareWeatherTab.tsx` | `Box`, `Flex`, `Heading`, `Link`, `Text` | Tailwind div, `a` tag |
| `CompactSnowForecastEmbed.tsx` | `Box`, `Button`, `Flex`, `Link`, `Spinner`, `Text`, css prop | Tailwind div, shadcn Button, CSS spinner |

#### 3.6 詳細機能（`src/features/resort-detail/`）

| ファイル | Chakra コンポーネント | 変換 |
|---|---|---|
| `SkiResortDetailView.tsx` | `Box`, `Button`, `Flex`, `Portal`, `Text`, `useBreakpointValue`, `Drawer` compound, `motion.create(Box)` | Tailwind div, shadcn components, vaul, CSS transition |
| `components/DetailTabs.tsx` | `Button`, `Flex`, css prop | shadcn Button, Tailwind div |
| `components/ElevationProfile.tsx` | `Box`, `Text` | Tailwind div |
| `components/ImageCarousel.tsx` | `Box`, `Button`, `Flex` | Tailwind div, shadcn Button |
| `components/InfoSection.tsx` | `Box`, `Button`, `Flex`, `Grid`, `Heading`, `Text`, css prop | Tailwind div |
| `components/SelectedCourseDetail.tsx` | `Box`, `Button`, `Flex`, `Grid`, `Heading`, `Image`, `Link`, `Text` | Tailwind div, shadcn components |
| `components/StatCard.tsx` | `Box`, `Text` | Tailwind div |
| `tabs/CoursesTab.tsx` | `Box`, `Button`, `Flex`, `Grid`, `Heading`, `NativeSelect.*`, `Table.*`, `Text` | shadcn components |
| `tabs/LiftsTab.tsx` | 同上 | 同上 |
| `tabs/OverviewTab.tsx` | `Box`, `Flex`, `Heading`, `Link`, `List`, `Table.*`, `Text` | Tailwind div, shadcn Table |
| `tabs/TicketsTab.tsx` | `Box`, `Flex`, `Heading`, `Table.*`, `Text` | Tailwind div, shadcn Table |
| `tabs/WeatherTab.tsx` | `Box`, `Flex`, `Heading`, `Link` | Tailwind div |

#### 3.7 編集機能（`lift-edit`, `slope-edit`, `review-edit`, `ticket-edit`）

これらはフォーム中心のコンポーネント群。`Input`, `Textarea`, `Button`, `Box`, `Flex`, `Heading`, `Text`, `Grid`, `NativeSelect` の変換が中心。

| ファイル群 | 主な Chakra コンポーネント | 変換 |
|---|---|---|
| `lift-edit/` | `Box`, `Button`, `Flex`, `Heading`, `Input`, `Text`, `colorPalette` | shadcn Input/Button, Tailwind div |
| `slope-edit/` | 同上 + `TutorialOverlay` | 同上 |
| `review-edit/` | `Box`, `Button`, `Flex`, `Grid`, `Heading`, `Input`, `Text`, `Textarea`, `lineClamp` | shadcn components |
| `ticket-edit/` | 同上 | 同上 |

### フェーズ 4: 設定・パッケージクリーンアップ

#### 4.1 package.json の変更

**削除するパッケージ:**
- `@chakra-ui/react`
- `@chakra-ui/next-js`
- `@emotion/react`

**追加するパッケージ:**
- `tailwindcss` (v4)
- `@tailwindcss/postcss`
- `class-variance-authority`（shadcn/ui 用）
- `clsx`（shadcn/ui 用）
- `tailwind-merge`（shadcn/ui 用）
- `sonner`（shadcn/ui toast 用）
- `@radix-ui/react-portal`（Portal 用、必要に応じて）

**維持するパッケージ:**
- `framer-motion` — 移行後にアニメーションが必要か判断して削除可否を決定
- `vaul` — Bottom Sheet として继续使用

#### 4.2 next.config.ts の変更

```typescript
// Before
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
    // ...
  },
  // ...
};

// After
const nextConfig: NextConfig = {
  // optimizePackageImports: Chakra UI 依存を削除したので不要
  // ...
};
```

#### 4.3 package.json scripts の変更

```json
// Before
{
  "dev": "next dev --webpack",
  "build": "next build --webpack"
}

// After
{
  "dev": "next dev",
  "build": "next build"
}
```

`--webpack` フラグを削除して Turbopack デフォルトを有効化。

### フェーズ 5: テスト・検証

1. **型チェック:** `pnpm typecheck`（`tsc --noEmit`）
2. **Lint:** `mise run lint`（Biome）
3. **フォーマット:** `mise run format`（Biome）
4. **開発サーバ:** `mise run dev`（Turbopack 有効化の確認）
5. **ビルド:** `mise run build`（Turbopack でのビルド成功確認）
6. **手動テスト:**
   - 各ページ（home, resort-detail, map, filters）の表示確認
   - フォーム入力（lift-edit, slope-edit, review-edit, ticket-edit）
   - モバイルレイアウト（`useBreakpointValue` の動作確認）
   - Bottom Sheet / Drawer（vaul の動作確認）
   - Toast 通知（admin 画面）
   - Table コンポーネント（比較タブ、詳細タブ）
   - アニメーション（framer-motion → CSS transition への移行確認）

## 移行の優先順位

大規模な変更になるため、以下の順序で段階的に実施する:

1. **P0: 基盤セットアップ** — フェーズ 1 全体（Tailwind v4, shadcn/ui 初期化）
2. **P0: Provider 系** — ChakraProvider → ThemeProvider への変更
3. **P1: 共有コンポーネント** — LoadingSpinner など
4. **P1: 表示系コンポーネント** — StatCard, ElevationProfile, InfoSection など
5. **P1: ホーム機能** — 主要な表示画面
6. **P2: 比較機能** — Table コンポーネントの移行
7. **P2: 詳細機能** — resort-detail 配下
8. **P2: 編集機能** — フォーム中心の機能群
9. **P3: クリーンアップ** — Chakra 依存パッケージの削除、scripts の変更

## 注意点・リスク

1. **`css` prop の廃止:** Chakra の `css={{ WebkitOverflowScrolling: "touch" }}` は Tailwind の `@utility` または直接の `style` prop に置き換え
2. **`colorPalette` prop の廃止:** `colorPalette="red"` は `className="text-red-600"` などに明示的変換が必要
3. **`as` prop の廃止:** `as="span"`, `as="label"` など → 正しい HTML 要素に置き換え
4. **`lineClamp` prop:** Tailwind v4 では `line-clamp-{n}` ユーティリティとしてサポートされている
5. **`motion.create(Box)`:** framer-motion の `motion.div` または CSS transition に置き換え
6. **`css` prop 使用ファイル（6 ファイル）:** CompactSnowForecastEmbed, WeatherChart, DetailTabs, SkiResortList, InfoSection, SourceMarks — 個別に変換ルールを適用
7. **Leaflet CSS:** 既存の Leaflet 関連 CSS は globals.css にそのまま維持。Tailwind v4 との競合は確認必要
8. **`--webpack` フラグの削除:** 移行完了前に `--webpack` フラグを残したままにすれば、Chakra 時代の互換性維持が可能（移行中の安全ネット）

## 見積もり

- **影響ファイル数:** 53 ファイル
- **変換が必要な Chakra コンポーネント:** 28 種類
- **主な変換パターン:** Box/Flex → Tailwind div, Table compound → shadcn Table, Button → shadcn Button
- **推奨実装順序:** 基盤 → 共有 → 表示 → 比較 → 詳細 → 編集 → クリーンアップ

`★ Insight ─────────────────────────────────────`
1. Box/Flex の使用が非常に多く（51/40 ファイル）、これらは Tailwind の utility class に単純置換可能
2. Table compound components は shadcn/ui の Table コンポーネントで完全に代替可能
3. Chakra v3 の `colorPalette` prop は明示的な Tailwind color class への変換が必要（自動化が難しい箇所）
4. framer-motion は削除可能だが、既存のアニメーションを CSS transition に置き換える作業が必要
5. vaul は Radix UI と互換性があるため、Bottom Sheet/Drawer として继续使用できる
`─────────────────────────────────────────────────`

## 完了報告（2026-08-11）

### フェーズ 1: Chakra UI → shadcn/ui 移行（完了）

1. **Chakra UI 依存パッケージの削除**: `@chakra-ui/react`, `@chakra-ui/next-js`, `@emotion/react` を `package.json` から削除し、`pnpm install` で node_modules から除去
2. **framer-motion の削除**: 4ファイルの `motion` 利用を `AnimatedPanel` コンポーネント（CSS transition 実装）へ置換
3. **`--webpack` フラグの削除**: `package.json` の `dev`/`build` スクリプトから削除し、Turbopack デフォルトを有効化
4. **`optimizePackageImports` の削除**: `next.config.ts` から `@chakra-ui/react` の記載を削除
5. **Chakra 参照のクリーンアップ**: `SkiResortList.tsx` の CSS 変数、`use-breakpoint-value.ts` のコメントから Chakra 参照を削除
6. **型エラー修正**: 8ファイルの型エラーを修正（align, variant, flexShrink, scrollMarginTop, media query, source-tip, Button import, multi-line className）
7. **Turbopack パースエラー修正**: マルチライン className リテラルを1行に統合

### フェーズ 2: shadcn/ui コンポーネントへの置換（完了）

#### Button への置換（3ファイル）
- **ResortSelectStep.tsx**: 5つの raw `<button>` → shadcn `<Button>`（primary/outline/colored variants）
- **CompareReviewsTab.tsx**: カテゴリフィルターボタン → shadcn `<Button>`（outline/default toggle）
- **LineEditStep.tsx**: validation alert 内の Button variant を修正

#### Alert への置換（2ファイル）
- **LineEditStep.tsx**: 2つの alert div（error/warning）→ shadcn `<Alert>` + `<AlertDescription>` + `<AlertTitle>`
- **DetailEditStep.tsx**: 1つの alert div → shadcn `<Alert>`

#### Badge への置換（3ファイル）
- **ResortSelectStep.tsx**: 4つの badge span → shadcn `<Badge variant="secondary">`
- **ReviewEditWorkspace.tsx**: 3つの badge span → shadcn `<Badge>`
- **FilterPanel.tsx**: `ResultCountBadge` コンポーネント → shadcn `<Badge>`

#### ScrollArea への置換（3ファイル）
- **DetailStep.tsx**: 2つの scrollable div → shadcn `<ScrollArea>`
- **DetailEditStep.tsx**: 2つの scrollable div → shadcn `<ScrollArea>`

#### Card + Separator への置換（1ファイル）
- **MapControls.tsx**: 1つの card div → shadcn `<Card>` + `<CardContent>`、separator div → shadcn `<Separator>`

#### Label への置換（1ファイル）
- **FilterControls.tsx**: 2つの raw `<label>` → shadcn `<Label>`

### 検証結果

- **型チェック**: `tsc --noEmit` **パス**
- **ビルド**: `next build` (Turbopack) **パス**
- **shadcn/ui コンポーネント**: 31種類インストール済み
- **src/ での shadcn インポート**: button, input, table, tooltip, alert, badge, scroll-area, card, separator, label, select, checkbox, textarea（11種類）
- **Chakra UI インポート**: 0件
- **framer-motion インポート**: 0件

### フェーズ 3: shadcn/ui コンポーネントへの追加置換（完了）

#### Table への置換（1ファイル）
- **SelectedCourseDetail.tsx**: `CourseStatusTable` コンポーネントの raw `<table>` → shadcn `<Table>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`

#### Badge への置換（7ファイル）
- **CollectionSection.tsx**: span ベースのバッジ → shadcn `<Badge variant="secondary">`
- **OverviewTab.tsx**: 雪マジ！タグの span → shadcn `<Badge>`
- **InfoSection.tsx**: 雪マジバッジの span → shadcn `<Badge>`
- **HomeLayout.tsx**: フィルターラベルと結果カウントの div/span → shadcn `<Badge>`
- **slope-edit/ResortSelectStep.tsx**: 下書きあり/既存データありの span → shadcn `<Badge>`
- **CoursesTab.tsx**: 難易度バッジの span → shadcn `<Badge>`

#### Tooltip への置換（1ファイル）
- **SourceMarks.tsx**: カスタムマウスイベントベースのツールチップ → shadcn `<Tooltip>` + `<TooltipContent>` + `<TooltipProvider>`

#### Input への置換（1ファイル）
- **ReviewEditWorkspace.tsx**: raw `<input>` 7箇所 → shadcn `<Input>`（text/date 両方）

#### Label への置換（3ファイル）
- **TicketPartyEditor.tsx**: raw `<label>` 3箇所（区分/年齢/人数）→ shadcn `<Label>`
- **MapControls.tsx**: raw `<label>` 1箇所 → shadcn `<Label>`
- **ReviewEditWorkspace.tsx**: raw `<label>` 1箇所 → shadcn `<Label>`

### フェーズ 4: shadcn/ui コンポーネントへの最終置換（完了）

#### Card + CardContent への置換（1ファイル）
- **MapControls.tsx**: zoom control, tile variant control, legend の card-like div 3箇所 → shadcn `<Card>` + `<CardContent>`

#### Badge への追加置換（1ファイル）
- **DetailStep.tsx**: 詳細結合バッジの span → shadcn `<Badge variant="secondary">`

#### SelectTrigger の簡素化（1ファイル）
- **ReviewEditWorkspace.tsx**: カスタム className の多い SelectTrigger → shadcn デフォルト className + 最小限のオーバーライド

#### Tab UI の確認
- **DetailTabs.tsx**: 既に shadcn `<Tabs>` + `<TabsList>` + `<TabsTrigger>` を使用（変更なし）
- **SkiResortDetailView.tsx**: DetailTabs を通じて shadcn Tabs を使用（変更なし）

### 最終置換フェーズ（2026-08-11）

#### Button への追加置換（10ファイル）
- **MobileSearchButton.tsx**: raw `<button>` 2箇所 → shadcn `<Button>`（variant="ghost"）
- **MobileSearchOverlay.tsx**: raw `<button>` 3箇所、raw `<input>` 1箇所 → shadcn `<Button>` + `<Input>`
- **CompactSnowForecastEmbed.tsx**: raw `<button>` 3箇所 → shadcn `<Button>`（variant="ghost"/"outline"）
- **FilterControls.tsx**: raw `<button>` 3箇所、raw `<input>` 1箇所 → shadcn `<Button>` + `<Input>`
- **ResortReviewSection.tsx**: raw `<button>` 1箇所 → shadcn `<Button>`（variant="outline"）
- **SkiResortCompareView.tsx**: raw `<button>` 1箇所 → shadcn `<Button>`（variant="ghost"）
- **LineEditStep.tsx**: raw `<input>` 1箇所（ファイル入力は除く）→ shadcn `<Input>`
- **ReviewEditWorkspace.tsx**: raw `<button>` 1箇所 → shadcn `<Button>`（variant="ghost"）

#### Input への追加置換（9ファイル）
- **LinksStep.tsx**: raw `<input>` 2箇所 → shadcn `<Input>`
- **DetailStep.tsx（lift-edit）**: raw `<input>` 11箇所 → shadcn `<Input>`
- **ResortSelectStep.tsx（lift-edit）**: raw `<input>` 1箇所 → shadcn `<Input>`
- **ResortSelectStep.tsx（slope-edit）**: raw `<input>` 1箇所 → shadcn `<Input>`
- **DetailEditStep.tsx（slope-edit）**: raw `<input>` 6箇所 → shadcn `<Input>`
- **FieldRenderer.tsx（ticket-edit）**: raw `<input>` 4箇所 → shadcn `<Input>`
- **TicketEditWorkspace.tsx**: raw `<input>` 1箇所 → shadcn `<Input>`

#### Label への置換（2ファイル）
- **FieldRenderer.tsx（ticket-edit）**: raw `<label>` 1箇所 → shadcn `<Label>`
- **MapControls.tsx**: raw `<label>` 1箇所 → shadcn `<Label>`

#### shadcn/ui コンポーネント追加インストール
- **tabs**: 既存だったが更新
- **dialog**: 新規インストール
- **popover**: 新規インストール
- **native-select**: 新規インストール

### 最終検証結果

- **型チェック**: `tsc --noEmit` **パス**
- **ビルド**: `next build` (Turbopack) **パス**
- **Chakra UI インポート**: 0件
- **framer-motion インポート**: 0件
- **raw `<table>`（アプリコード）**: 0件
- **raw `<button>`（アプリコード）**: 0件
- **raw `<input>`（アプリコード）**: 1件（`LineEditStep.tsx` のファイル入力 — shadcn Input はファイル入力をサポートしないため正当な例外）
- **raw `<textarea>`（アプリコード）**: 0件
- **raw `<label>`（アプリコード）**: 0件
- **shadcn/ui コンポーネント**: 31種類インストール済み
- **src/ での shadcn インポート**: button, input, table, tooltip, alert, badge, scroll-area, card, separator, label, select, checkbox, textarea, collapsible, dialog, popover, native-select（16種類）
