# 検証項目
## 1. 取得できなかった情報がnullになっているか
- 判定: 概ね問題なし
- 場所: [src/scripts/crawl_latest/resorts/hakuba-happo-one.ts](src/scripts/crawl_latest/resorts/hakuba-happo-one.ts#L84-L118) と [src/scripts/crawl_latest/resorts/hakuba-happo-one.ts](src/scripts/crawl_latest/resorts/hakuba-happo-one.ts#L138-L226)
- 未取得値は `null` / 空文字で整合しています。

## 2. 順番依存のコードが少ないか
- 判定: 改善されている
- 場所: [src/scripts/crawl_latest/resorts/hakuba-happo-one.ts](src/scripts/crawl_latest/resorts/hakuba-happo-one.ts#L1-L226)
- テーブル列はヘッダー解決ベースになっており、以前より順番依存が低いです。
- ただし `img.first()` を使う箇所は、複数アイコン化されると誤判定余地があります。

## 3. 文字列検索に頼りすぎていないか
- 判定: 許容範囲
- 場所: [src/scripts/crawl_latest/resorts/hakuba-happo-one.ts](src/scripts/crawl_latest/resorts/hakuba-happo-one.ts#L1-L226)
- 通常は locator ベースで、本文パースは天候フォールバック時のみです。

## 4. template.tsから過度に変更されていないか
- 判定: 許容範囲
- 場所: [src/scripts/crawl_latest/resorts/hakuba-happo-one.ts](src/scripts/crawl_latest/resorts/hakuba-happo-one.ts#L1-L226)
- 補助関数は増えていますが、構造と出力は template 系を維持しています。

## 5. 状況に依存するclass名を不適切に使っていないか
- 判定: 問題なし
- 指摘対象の状態 class 名は使っていません。

## 6. 出力されたJSONに情報は入っているか
- 判定: 概ね良い
- 場所: [src/data/resorts-temporary/latest_data/hakuba-happo-one/2026_0425_173554.json](src/data/resorts-temporary/latest_data/hakuba-happo-one/2026_0425_173554.json)
- `weather/courses/lifts` ともに埋まっています。
- オフシーズンのため `status` が `×` 中心なのは自然です。

## 7. その他気づいた点
- 場所: [src/scripts/crawl_latest/resorts/hakuba-happo-one.ts](src/scripts/crawl_latest/resorts/hakuba-happo-one.ts#L1-L226)
- 地点名が `名木山` ではなく `ゴンドラ山麓駅` キーで出るため、下流のキー期待値が固定なら要整合です。