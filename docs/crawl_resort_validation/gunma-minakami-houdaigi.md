# 検証項目
## 1. 取得できなかった情報がnullになっているか
- 判定: 問題あり
- 場所: [src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts](src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts#L169-L227) と [src/data/resorts-temporary/latest_data/gunma-minakami-houdaigi/2026_0425_173550.json](src/data/resorts-temporary/latest_data/gunma-minakami-houdaigi/2026_0425_173550.json)
- `courses[].status` が空文字 `""` になっており、`null` でも有効値でもありません。

## 2. 順番依存のコードが少ないか
- 判定: やや問題あり
- 場所: [src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts](src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts#L58-L118) と [src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts](src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts#L169-L205)
- ニュース一覧の優先判定（当日/翌日→なければ先頭）に順番依存があります。
- コースカード順にも一定依存があります。

## 3. 文字列検索に頼りすぎていないか
- 判定: やや問題あり
- 場所: [src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts](src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts#L227-L235)
- リフト抽出で `body` 全文の正規表現フォールバックを使っています。

## 4. template.tsから過度に変更されていないか
- 判定: やや逸脱
- 場所: [src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts](src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts#L1-L280)
- ニュース詳細遷移や本文正規表現など、独自ロジックが多めです。

## 5. 状況に依存するclass名を不適切に使っていないか
- 判定: 問題なし
- 指摘対象の状態 class 名は使っていません。

## 6. 出力されたJSONに情報は入っているか
- 判定: 問題あり
- 場所: [src/data/resorts-temporary/latest_data/gunma-minakami-houdaigi/2026_0425_173550.json](src/data/resorts-temporary/latest_data/gunma-minakami-houdaigi/2026_0425_173550.json)
- `lifts` は埋まりましたが、`courses` の `status` が全件空で実用不可です。
- 実行時warningでも `Course Status is null or empty` が多数発生しています。

## 7. その他気づいた点
- 場所: [src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts](src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts#L169-L227)
- コース名に `~中級~` など難易度表記が残存しています。
- 改善方針: コースステータスを `label` 文字列だけに頼らず、コースカード内の状態アイコン/状態テキストを優先して抽出し、未取得時のみ `null` にする。