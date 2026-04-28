# クローラ移行レポート

## 変更内容

### geto-kogen

- ファイル:
	- src/scripts/crawl_latest/resorts/geto-kogen.ts
- 変更内容:
	- template.ts 形式へ移行し、画像IDベースのコース・リフト判定を共通ユーティリティ経由に整理しました。
	- 出力先ディレクトリの自動作成と保存処理を追加しました。
- 理由:
	- 既存ロジックを維持しつつ、他クローラと同じ保存・検証パターンへ合わせるためです。
- 実行確認:
	- `tsx` 実行でJSON保存まで成功し、追加警告はありませんでした。
- 残っている警告:
	- なし

### hakuba-happo-one

- ファイル:
	- src/scripts/crawl_latest/resorts/hakuba-happo-one.ts
- 変更内容:
	- template.ts 形式へ移行し、天候・コース・リフトの取得を共通ユーティリティで統一しました。
	- 出力先ディレクトリの自動作成を追加しました。
- 理由:
	- 既存のページ構造を保ちながら、保存処理と検証処理を標準化するためです。
- 実行確認:
	- `tsx` 実行でJSON保存まで成功し、追加警告はありませんでした。
- 残っている警告:
	- なし

### hunter-mountain-shiobara

- ファイル:
	- src/scripts/crawl_latest/resorts/hunter-mountain-shiobara.ts
- 変更内容:
	- template.ts 形式へ移行し、天候・コース・リフトの取得と保存処理を整理しました。
	- 出力先ディレクトリの自動作成を追加しました。
- 理由:
	- 既存の取得ロジックを維持しつつ、標準構造に合わせるためです。
- 実行確認:
	- `tsx` 実行でJSON保存まで成功し、追加警告はありませんでした。
- 残っている警告:
	- なし

### gala-yuzawa

- ファイル:
	- src/scripts/crawl_latest/resorts/gala-yuzawa.ts
- 変更内容:
	- template.ts 形式へ移行し、コース・リフト判定をテーブル行ベースに再実装しました。
	- 観光営業ページの文言を拾うため、天気・更新時刻のフォールバック抽出を追加しました。
- 理由:
	- 既存の `table-bordered` 構造が季節営業で崩れ、従来の selector だけでは取得できなかったためです。
- 実行確認:
	- `tsx` 実行でJSON保存まで成功しました。
- 残っている警告:
	- 天候・コース・リフトの一部が営業形態の変化で取得できず、警告が残っています。

### gunma-minakami-houdaigi

- ファイル:
	- src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts
- 変更内容:
	- template.ts 形式へ移行し、ニュース本文から営業時間を拾う処理を維持しました。
	- コース状態の判定を文言ベースで少し広げ、リフト未取得時のフォールバックを追加しました。
- 理由:
	- ページ上のリフト表示が空になっており、既存の selector だけでは件数が取れなかったためです。
- 実行確認:
	- `tsx` 実行でJSON保存まで成功しました。
- 残っている警告:
	- リフト一覧が取得できず、件数警告が残っています。

### ikenotaira-onsen-alpen-blick

- ファイル:
	- src/scripts/crawl_latest/resorts/ikenotaira-onsen-alpen-blick.ts
- 変更内容:
	- template.ts 形式へ移行し、取得処理と保存処理を整理しました。
	- 余計な空行を除外するようにしました。
- 理由:
	- 現在のページ構造では course/lift のセレクタが安定せず、空行由来の警告が大量に出ていたためです。
- 実行確認:
	- `tsx` 実行でJSON保存まで成功しました。
- 残っている警告:
	- コース・リフトの取得はできたものの、更新時刻が空で、件数警告も残っています。

## 要確認

### gala-yuzawa

- ファイル:
	- src/scripts/crawl_latest/resorts/gala-yuzawa.ts
- URL:
	- https://gala.co.jp/winter/
	- https://gala.co.jp/winter/gelande/
- 問題:
	- 観光営業ページに切り替わっており、コース・リフトの通常営業情報が取得できません。
- 人間に確認してほしいこと:
	- 現在の営業形態で `courseNum` / `liftNum` を観光営業向けに変更するか、取得対象を別ページへ切り替えるか確認してください。

### gunma-minakami-houdaigi

- ファイル:
	- src/scripts/crawl_latest/resorts/gunma-minakami-houdaigi.ts
- URL:
	- https://hodaigi.jp/gelande-guide/
- 問題:
	- 画面上ではリフト運行情報が見えている一方で、DOM上の既存 selector ではリフト要素を安定取得できませんでした。
- 人間に確認してほしいこと:
	- リフト一覧の実DOM構造を確認し、必要なら selector を table/リスト基準に再調整してください。

### ikenotaira-onsen-alpen-blick

- ファイル:
	- src/scripts/crawl_latest/resorts/ikenotaira-onsen-alpen-blick.ts
- URL:
	- https://alpenblick-resort.com/ski
- 問題:
	- 現在のページではコース・リフトのDOMが期待通りに安定しておらず、件数警告と更新時刻空欄が残っています。
- 人間に確認してほしいこと:
	- 取得対象のセクションが別ページへ移動していないか確認し、必要なら course/lift の取得元を見直してください。

## 失敗