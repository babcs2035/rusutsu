---
name: fix-ski-resort-latest-crawler
description: 既存のスキー場営業情報クローラーで、遷移・selector・抽出・バッチ実行時間・remote保存の失敗を調査して修正する。対象を絞った修正に使い、新規作成や広範な公式情報調査ではbuild-ski-resort-latest-crawlerを使う。
---

# Ski Resort Latest Crawler の修正

`src/private/scripts/crawl_latest/resorts/<resort-id>.ts` の特定の不具合を、無関係な作業を保護しながら修正する。診断・修正の手順であり、remote環境の変更や根拠のない本番書き込みの許可ではない。

## 手順

1. 対象ソース、git status、既存差分全体を編集前に読む。ユーザーの変更を保護し、dirtyなファイルをreset・checkout・上書きしない。診断のrunが記録したsource hash/revisionと現在のソースを照合してから原因を帰属させる。
2. 本番で失敗・警告が出ている場合は、再現や修正の前に、その本番runに紐づく保存DOMを取得して実際のHTMLを確認する。`mise run crawl:diagnostics:pull -- --run-id <失敗run-id>` を使う。`--resort <id>` は最新の警告run（冬季検証を含む）を選ぶため、対象障害のrun ID・日時・sourceModeが一致するか確かめる。run/issue、所要時間、要求/遷移先URL、selector、HTTP状態、ソースハッシュと保存DOMを照合し、確認したrun ID・artifact ID・ローカルパスを根拠として残す。DBにはrun/issue/DOMの参照情報、HTML本体はAPI側の非公開volumeにgzipで保存される。期限切れ・保存失敗・ブラウザ起動前の失敗・API保存自体の失敗ではDOMがないこともあるので、取得できない理由を記録し、現行ページの再取得を失敗時DOMの代わりに確認済みとしない。秘密値を出力しない。
3. 遅延・失敗箇所がnavigation（`goto`/load）、selector待機、抽出、ローカルバッチ上限、POST/remote API、サーバー永続化/現在値反映のどこかを特定する。ブラウザ抽出とAPI保存を別に扱う。APIのメモリ上の`Saved`表示は永続化の根拠にせず、run・カテゴリデータ・admin/current値を個別に確認する。
   API保存が500なら、送信済みpayloadとサーバー検証後のstate・validationState・eligibleForCurrentを、Prisma定義だけでなく適用済みSQLのCHECK制約とも照合する。LIVEだけ失敗しアーカイブは通る場合、現在値の採用条件がDB制約と一致するか確認する。再現はローカルの一時テーブルや隔離DBで行い、アーカイブ扱いや空データの捏造で本番の制約を回避しない。
4. 失敗selectorと抽出値を、保存済みrendered DOMおよび公式ページと照合する。季節性が関わる場合、冬季アーカイブと現行冬季情報を別々に確認する。根拠なく旧シーズンの在庫を新シーズンへ流用しない。
5. 根拠に沿って最小限のコード変更を行う。対象要素が存在するが遅れて読み込まれる実測がある場合だけtimeoutを延長する。DOMに存在しないselectorの待ち時間は延ばさない。季節限定情報が未確認なら冬季再調査TODOを残すか更新する。
6. [build-ski-resort-latest-crawler](../build-ski-resort-latest-crawler/SKILL.md) の適用可能な検証要件に従い、ソース/DOM/状態、失敗経路、永続化を独立して検証する。まず現行公式DOMと抽出を確認し、次に想定失敗の診断を確認し、その後remote run・保存カテゴリ・admin/current値を確認する。ローカル結果やHTTP応答だけで永続化確認を代替しない。アーカイブや異常注入結果を現行値として扱わせない。各段階の結果と未確認事項を分けて報告する。

## 適用範囲と運用上の制約

- DOM抽出、状態、出典URL、冬季アーカイブ検証、クローラー固有の検証要件は[build-ski-resort-latest-crawler](../build-ski-resort-latest-crawler/SKILL.md)を正とする。実装マニュアルを重複させず、関連箇所を読む。
- 調査メモ・診断取得物・補助資料は`src/private/data/resorts-temporary/tmp/<resort-id>-audit/`、DOMは既存の`crawl_latest_dom/<resort-id>/`、実行ログは`logs/`に置く。再利用スクリプトは`src/private/scripts/`で管理する。
- 範囲の狭い検索・抽出・定型JSON/コード編集は、`gpt-6-luna` lowのサブエージェントを優先し、複数資料の照合はmediumを使う。通常1体、独立作業がある場合のみ最大2体とし、子から再委譲しない。原因判断、差分保護、独立検証は親が担う。使えない場合や難しい場合は直接続行する。
- API token、cookie、DB接続文字列などの秘密値を表示しない。POST失敗時は同条件の盲目的な再試行を止め、観測結果を報告する。原因調査のための独立した読み取り、別モード、ローカル検証は続けてよい。remote再試行は新しい診断根拠と理由が得られてから判断する。永続化したと断定しない。

## GALA湯沢の事例

このスキー場または同じ季節性selector問題に限り、[references/gala-yuzawa.md](references/gala-yuzawa.md)を読む。既知のtimeout証拠と、原因未確認のremote API失敗を区別している。
