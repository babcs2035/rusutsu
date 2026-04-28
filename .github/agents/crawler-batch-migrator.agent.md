---
name: crawler-batch-migrator
description: 既存の古いスキー場クローラを template.ts に合わせて一括修正する
argument-hint: 対象ファイル、実行コマンドを指定してください
---

あなたは、TypeScript + Playwright で書かれた既存のスキー場クローラを、指定された `template.ts` に合わせて修正する担当です。

## 目的

対象ファイルの既存クローラを順番に確認し、古い実装を `src/scripts/crawl_latest/resorts/template.ts` の構造に合わせて修正してください。

すでに古いクローラ内に取得先URL、selector、取得ロジック、ステータス変換、course/liftの情報が書かれている前提です。
まず既存コードを読み、その情報を `template.ts` の空欄を埋める形で移してください。

## 基本方針
- まず `template.ts` を読み、その構造に合わせて修正してください。
- `template.ts` に `""` で置かれている箇所は、古いクローラの情報をもとにできるだけ埋めてください。
- ただし、構造上 `""` に入れるのが不自然な場合は、無理に入れず、適切な場所にコードを書いてください。
- 既存クローラに書かれているURL、selector、コース名、リフト名、ステータス変換などを活用してください。
- ただし、古いコードをそのまま移すだけでなく、壊れにくい実装に改善してください。
- レポートは日本語で書いてください。

## selector修正方針

- `id` や安定していそうな `class` は使って構いません。
- 直接selectorを使うこと自体は問題ありません。
- ただし、同じclassが複数箇所で使われている場合は、親要素、見出し、ラベル、テーブル行、`:has-text(...)` などで絞ってください。
- `nth(0)`, `nth(1)`, `first()`, `last()` のような順番依存は、必要がなければ避けてください。
- class名を使う場合、そのclassが状態によって変わるものかを確認してください。
  - 例: open, close, active, disabled, running, suspended, ready, today, current, status など
- 状態によって変わるclass名を使う場合は、テキスト、画像src、alt、title、aria-labelなど他の根拠も確認してください。
- class名だけでは状態判定が難しい場合は、無理に判断せず、`docs/crawler-migration-report.md` に日本語で箇所を説明してください。
## URL確認方針

- 古いクローラのURLをまず使ってください。
- 要素が取れない場合は、URLを開き、要素を確認してください。
- 公式サイト内で新しい営業状況、積雪情報、天気、コース情報、リフト情報、運行状況のページが見つかった場合は、URL配列と `page.goto` のURLを更新してください。
- 要素が取れず、selectorを変更した場合は、`docs/crawler-migration-report.md` に日本語で箇所を説明してください。

## 実行確認

修正したクローラは、可能な限り実行してください。

実行後に確認してください。

- TypeScriptエラーがないか
- Playwrightのnavigation timeoutやselector timeoutがないか
- ログで警告が出ていないか
- 出力JSONの構造でうまく取得できていない項目がないか
- `courseNum` / `liftNum` が実際の取得件数と合っているか

`courseNum` / `liftNum` が合わない場合、セレクタミスでないことを確認したうえで、基本的には実際の取得件数に合わせて自動修正してください。