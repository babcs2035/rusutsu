# 検証項目
## 1. 取得できなかった情報がnullになっているか
- 判定: 概ね問題なし
- 場所: [src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts](src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts#L1-L220)
- `snowfall/condition/windSpeed` など未提供項目は `null` になっています。

## 2. 順番依存のコードが少ないか
- 判定: 問題あり
- 場所: [src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts](src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts#L54-L86)
- `div:nth-child(...)` による天候・気温・積雪の抽出が残っています。

## 3. 文字列検索に頼りすぎていないか
- 判定: 許容範囲
- 場所: [src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts](src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts#L39-L80)
- `bodyText` は更新日フォールバックのみで、全面依存ではありません。

## 4. template.tsから過度に変更されていないか
- 判定: 許容範囲
- 場所: [src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts](src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts#L1-L220)
- 構造は template 準拠ですが、weather selector はやや独自です。

## 5. 状況に依存するclass名を不適切に使っていないか
- 判定: 問題なし
- 指摘対象の状態 class 名は使っていません。

## 6. 出力されたJSONに情報は入っているか
- 判定: 概ね良い
- 場所: [src/data/resorts-temporary/latest_data/hunter-mountain-shiobara/2026_0425_173601.json](src/data/resorts-temporary/latest_data/hunter-mountain-shiobara/2026_0425_173601.json)
- `courses/lifts` は埋まっています。
- ただし `weather.update` が `2026/04/01` で固定的に見え、実更新日時の取得としては不正確な可能性があります。

## 7. その他気づいた点
- 場所: [src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts](src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts#L39-L86) と [src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts](src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts#L86-L220)
- `comment` が `<span>積雪</span>...` 断片になっており、利用者向けコメントとしては品質が低いです。
- 改善方針: 更新日時は `TODAY'S CONDITION` ブロック内の日時文字列を直接抽出し、comment は告知本文ブロックへ変更する。