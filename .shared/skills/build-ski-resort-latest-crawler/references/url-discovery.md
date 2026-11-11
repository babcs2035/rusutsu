# 公式URLの調査（Stage 0）

URLの指定がない、または不足カテゴリの調査も頼まれたときに読む。検索は候補探しに使い、採用は実際に開いた本文で決める。URLを推測で組み立てない。存在しない情報のURLを作らない。

## 探すもの

| キー | 中身 | クローラーでの扱い |
| --- | --- | --- |
| weatherUrl | 天気・気温・積雪・降雪・雪質/コンディション・風速・更新日時 | 値を読む |
| commentUrl | スキー場が毎日（営業日ごと）書く、その日の営業・ゲレンデに関するコメント欄 | 本文を `comment` として読む |
| courseUrl | コースごとの当日オープン/クローズ一覧 | 値を読む |
| liftUrl | リフト・ゴンドラごとの当日運行一覧 | 値を読む |
| newsUrl | お知らせ・ニュースの一覧ページ | **読まない**。`SkiResortLinks` の `newsUrls` に登録するだけ |

- commentUrl とお知らせ一覧を混同しない。日付付き記事が並ぶ一覧は newsUrl、その日の営業に関する定型のコメント欄が commentUrl。個別状態が非掲載でも「本日は全面営業」のような全体営業表示があれば commentUrl 候補（扱いは実装ガイドの「全体営業表示だけのページ」）。
- 静的なコース紹介・コースマップ・リフト紹介は courseUrl / liftUrl にしない。当日の状態が載るページだけ。
- 同じページに複数カテゴリが載るなら、同じURLを各カテゴリに重複して挙げてよい。迷ったら両方に入れ、実装時に実際に値を読んだかで出典を確定する。

## 公式性

- 採用するのは公式ドメインだけ。スキー場公式サイト、運営会社・系列リゾートの共通ドメイン、自治体直営施設の自治体ページ、観光協会が公式に案内する営業情報ページ。系列共通ドメイン等を使う場合は「公式として扱った根拠」（公式サイトからのリンク元、運営者表記）を記録する。
- 除外: surf&snow、snowjapan、じゃらん、yukiyama等の情報サービス、SNS、まとめ・ブログ、検索スニペットだけの情報。yukiyamaのページを取得元にしない（SKILL.mdの禁止事項）。
- 公式ページがiframeや部品で外部ドメインの営業情報を埋め込んでいる場合、URLとして採用するのは公式ページ側。埋め込み先は「部品」として記録する。
- 自称「公式」、検索順位、ドメイン名の見た目では決めない。施設名・所在地・運営者が対象スキー場と一致することを開いて確かめる。同名施設・旧名称・同じ運営会社の別スキー場を混同しない。

## 手順

1. 起点を決める。`src/private/data/SkiResortLinks.json` の `officialSiteUrls`、既存の `latest_status_sources/<resort-id>.json`、capability台帳、既存クローラーを確認する。マスタのURLも古い可能性があるので開いて確かめる。
2. 公式トップから、ゲレンデ情報・本日の営業・リフト運行・コンディション・お知らせ等の導線を辿る。メニュー、フッター、英語版、スマホ用メニュー、トップに埋め込まれた営業情報欄も見る。
3. 足りなければ検索する（「正式名 リフト運行状況」「正式名 ゲレンデ情報」「正式名 積雪」「site:<公式ドメイン> リフト」など）。
4. 候補は Playwright で開き（WebFetchが403等で読めないサイトも多いので、こちらを基本にする）、表示後のDOMを `capture-rendered-pages.mjs` で `crawl_latest_dom/<resort-id>/` へ保存して本文を確認する。404・リダイレクト・「シーズン終了」表示はその事実を記録する。WebFetch等の要約は候補探しにだけ使い、運営者表記・状態欄・凡例・更新日時の判断は保存したDOMの本文で行う（要約は推測で補うことがある）。
5. 冬季アーカイブを確認する。夏は空でも冬は載ることが多い。
   - 候補ページの冬季スナップショット: `node .shared/skills/build-ski-resort-latest-crawler/scripts/find-winter-snapshots.mjs --url '<url>'`
   - 夏は消えていて冬だけ存在したページの候補: `... --prefix 'https://<公式ドメイン>/' --grep 'lift|course|gelande|snow|condition|today|info|news'`
   - 出てきた `raw` を `capture-rendered-pages.mjs` で保存して本文を見る。Waybackは指定日時の最寄りの版を返すので、台帳の `archive` には**実際に返った版のタイムスタンプ**（保存後の `finalUrl` に含まれる14桁）を書き、ページ内の更新表示（例: `UPDATE:2026/02/27 12:00`）は `evidence` に書く。
   - 現行のトップがオフシーズン用の特設ページで導線が消えている場合は、トップ自体の冬季アーカイブを保存し、そのメニュー・リンクから営業情報ページを探す。見つけたURLは現行でも開き、404等なら `winter_only` とする。アーカイブは「冬に何が載るか」の根拠であり、現行値としては使わない。Waybackは連続アクセスに厳しいので、間を空けて1件ずつ開く。
6. フラグメントとクエリを確認する。セクションに `id` があれば `#id` を付け、タブがクエリで選べるなら `?tab=lift#menu03` のように両方残す。付けるのは、そのURLで対象が実際に表示されることを確認したものだけ（保存DOMにその `id` の要素があり、対象の表・欄がその要素の中か直後にあること）。全カテゴリが同じ欄にまとまっていれば、同じ `#id` 付きURLを各カテゴリに書いてよい。オフシーズンで現行に要素がなければ、冬季アーカイブで確認した事実を `evidence` に書く。コースとリフトが同じページでも、直接表示できるタブが違えば別URLにする。リダイレクト後は最終URLを使い、追跡パラメータは除く。
7. 公式導線と不足カテゴリの検索、冬季アーカイブまで確認したら区切る。見つからないものは「掲載なし」とし、無限に探さない。

## 確認結果の分類

カテゴリごとに次のどれかで記録する。

- `found`: 現行ページで確認できた。
- `winter_only`: 現行はオフシーズンで空・非公開だが、冬季アーカイブで掲載を確認できた（アーカイブ日時を付ける）。
- `not_listed`: 公式導線・検索・冬季アーカイブを確認しても掲載がない（何を見たかを根拠に書く）。
- `unavailable`: 候補はあるが開けない・内容を確認できない。
- `not_checked`: 未調査。残っていれば調査未完了。

「確認済み」とだけ書かない。何を開き、どの見出し・表・文言を見て判断したかを書く。

## 記録

調査結果は `src/private/data/resorts-temporary/latest_status_sources/<resort-id>.json` に保存する（Git管理。次回以降の再調査の起点になる）。

```json
{
  "resortId": "<resort-id>",
  "checkedAt": "YYYY-MM-DD",
  "officialBasis": "公式サイトと判断した根拠（運営者表記・リンク元）",
  "decision": "implement | no_crawler",
  "categories": {
    "weather": { "result": "found", "urls": ["https://..."], "evidence": "山頂・山麓の気温と積雪の表（#snow）を確認", "archive": null },
    "comment": { "result": "winter_only", "urls": ["https://..."], "evidence": "…", "archive": "20260217062106" },
    "course": { "result": "not_listed", "urls": [], "evidence": "公式メニュー・site検索・2026年1〜2月のアーカイブに個別コース状態なし" },
    "lift": { "result": "found", "urls": ["https://...?tab=lift#menu03"], "evidence": "…", "archive": null },
    "news": { "result": "found", "urls": ["https://.../news/"], "evidence": "日付付きお知らせ一覧" }
  },
  "legend": [{ "url": "https://...", "text": "○:運行 ×:運休 △:準備中" }],
  "updateFormat": "例: 2026/02/17 07:30 更新（表示なしなら null）",
  "stations": ["山頂", "山麓"],
  "embeddedParts": [],
  "rejected": [{ "url": "https://...", "reason": "静的なコース紹介" }],
  "unresolved": ["確認できなかった点"]
}
```

## 当日の営業情報が公式に載っていない場合

weather・comment・course・lift のすべてが `not_listed`（または開けず確認不能）なら、**クローラーは実装しない**。`decision: "no_crawler"` として記録し、根拠を残す。

- 空のクローラーや、全カテゴリ空で保存するだけのファイルを作らない。
- それでもお知らせ一覧（newsUrl）や公式サイトが見つかったら、リンクとして登録する（下記）。
- 4カテゴリのうち1つでも確認できたら `implement` とし、確認できたカテゴリだけ実装する。

## newsUrl の登録

お知らせ一覧は管理画面と同じ正本（DataDocument の `SkiResortLinks.json`）の `newsUrls` へ追加する。ローカルJSONの手編集では本番に入らない。

```bash
# まず dry-run で既存値と追加予定を確認する
mise exec -- node --import tsx src/private/scripts/addResortLinks.ts \
  --resort <resort-id> --url '<news-list-url>'
# 問題なければ反映（読み直しで一致を確認し、ローカル控えにも追記する）
mise exec -- node --import tsx src/private/scripts/addResortLinks.ts \
  --resort <resort-id> --url '<news-list-url>' --apply
```

- 一覧ページだけを登録する。個別記事、トップページ、SNSは登録しない。複数エリアの一覧が別々にあれば複数登録してよい。
- 登録するのは、そのスキー場のお知らせが並ぶ一覧。スキー場サイトのお知らせ一覧、運営会社サイトのスキー場カテゴリ、自治体サイトのスキー場・スポーツ施設カテゴリなど。
- 自治体・観光協会・運営会社の**全体のお知らせ一覧**（スキー場と無関係の記事が大半のもの）は登録しない。スキー場向けのカテゴリやタグの一覧がなければ newsUrl は「掲載なし」とする。
- 既存のURLは消さない（スクリプトは追加のみ。重複は自動で除く）。
- `officialSiteUrls` が空・古い場合も同じスクリプトで `--platform officialSiteUrls` を指定して追加できる。
- 反映に失敗したら同じ条件で何度も再試行せず、エラーを報告する。
