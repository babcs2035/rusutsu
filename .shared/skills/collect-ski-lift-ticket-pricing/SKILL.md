---
name: collect-ski-lift-ticket-pricing
description: ユーザーが指定した公式URLから、利用日を指定して購入するリフト券（日券・時間券・回数券・複数日券・セット券等）の料金を収集し、全スキー場共通のJSON（1スキー場×1シーズン×1JSON）へ整理する。シーズン券とその購入者・保有者向け特典はURL取得・抽出・監査のすべてで対象外。「〇〇スキー場のリフト券料金を収集して」「リフト券JSONを作って/更新して/監査して」のような依頼で使う。取得(Playwright)＋抽出→独立監査の2段階で実行し、推測は一切行わない。URL登録はスキー場1件＝1ファイルで src/private/data/lift-ticket-source/{ski-resort-id}.json、保存資料・出力JSONは src/private/data/lift-ticket/ 配下。日付指定の料金照会は scripts/lookup-price.mjs。
---

# リフト券料金収集Skill（collect-ski-lift-ticket-pricing）

ユーザーが指定した公式URLだけを情報源として、スキー場のリフト券料金を
`1スキー場 × 1シーズン × 1JSON` の共通フォーマットへ整理する。

このSkillの正本は `.shared/skills/collect-ski-lift-ticket-pricing/` にあり、
`.agents/skills/` と `.claude/skills/` からはシンボリックリンクで参照される。
**編集は必ず `.shared/` 側に対して行うこと（リンク先は自動的に追従する）。**

## パス一覧（リポジトリルート基準）

| 用途 | パス |
| --- | --- |
| Skill正本 | `.shared/skills/collect-ski-lift-ticket-pricing/` |
| 標準ラベル定義（正本） | `references/taxonomy.json` |
| データモデル解説 | `references/data-model.md` |
| 抽出ルール | `references/extraction-rules.md` |
| 具体例集 | `references/examples.md` |
| JSON Schema（**モデルは読まない**。検証スクリプト専用） | `references/lift-ticket.schema.json` |
| 出力テンプレート | `templates/lift-ticket.template.json` |
| URL登録テンプレート | `templates/source-urls.template.json` |
| 日付→料金の照会スクリプト | `scripts/lookup-price.mjs` |
| URL登録ファイル（1スキー場＝1ファイル） | `src/private/data/lift-ticket-source/{ski-resort-id}.json` |
| 保存資料（証拠） | `src/private/data/lift-ticket/{resort-id}/sources/{season-id}/` |
| 料金PDF・料金画像の保存先 | `src/private/data/lift-ticket/{resort-id}/sources/{season-id}/downloads/` |
| 出力JSON | `src/private/data/lift-ticket/{resort-id}/tickets/{season-id}.json` |
| 監査レポート | `src/private/data/lift-ticket/{resort-id}/audits/{season-id}.audit.json` |

**スキー場1件のデータは1ディレクトリにまとまっている。**

```
src/private/data/
├── lift-ticket-source/          入力（登録URL・シーズンに紐づかない）
│   └── {resort-id}.json
└── lift-ticket/                 成果物
    └── {resort-id}/             ← スキー場ごとに1ディレクトリ
        ├── sources/{season-id}/     証拠
        ├── tickets/{season-id}.json 出力JSON
        └── audits/{season-id}.audit.json
```

出力先はユーザーが明示的に指定した場合のみ変更してよい。

`lift-ticket.schema.json` は705行あり、`validate-lift-ticket.mjs` が読むための
ファイルである。**モデルが直接読む必要はない**（構造の説明は
`data-model.md` が担う）。読むと無駄に文脈を消費する。

### 保存資料の構成（1ページあたり）

```
page-001/
├── visible-text.txt   表示テキスト。★最初に読む主資料
├── tables.md          表をTSV化（rowspan/colspan解決済み）
├── screens/
│   ├── full.jpg       フルページ。**人間**が後から確認するための資料
│   └── 01.jpg…NN.jpg  1280×1400pxのタイル。★モデルが見る用
├── metadata.json      取得の証跡（URL・HTTPステータス・SHA256・操作ログ）
├── page.html          JavaScript実行後のHTML（原則読まない）
├── links.json         ページ内リンク一覧（追加取得の候補確認用）
└── network/           料金APIのJSONレスポンス（動的価格のサイト用）
downloads/             公式PDF・料金画像（Readツールで直接読む）
```

### tables.md — 表のTSV化

`visible-text.txt`（＝`innerText`）が**復元不可能に壊す唯一の情報が、表の
行と列の対応**である。実例（めがひら）: セル内の改行によって

```
9時間券	平日：6,300円
土日：6,800円	4,300円      ← 別の行・別の列の値が同じ行に見える
```

となり、**一見パースできそうに見えて壊れている**。`tables.md` は
`rowspan`/`colspan` を解決し、結合セルを占有マスに複製した1セル=1値の
TSVを持つ。**表の金額はここから読む。画像から読み直さない。**

### 保存資料をフォーマッタに触らせない

`biome.json` の `files.includes` で `src/private/data` を除外している。
除外前は `mise run lint`（= `biome check --write src`）が**取得した
`page.html` を実際に書き換え**、`manifest.json` の `sha256_page_html` が
全ページ不一致になった（一度発生し、取り直して復旧した）。

保存資料は**取得時点のページをそのまま凍結したもの**であり、整形対象ではない。
`src/private/scripts`（クローラー本体）はソースコードなのでlint対象に残す。

改変の検出はmanifestのハッシュでできる:

```bash
cd src/private/data/lift-ticket/<resort>/sources/<season>
node -e "const c=require('crypto'),fs=require('fs'),m=require('./manifest.json');
for(const p of m.pages)console.log(p.id, c.createHash('sha256').update(fs.readFileSync(p.dir+'/page.html')).digest('hex')===p.sha256_page_html?'OK':'NG');"
```

### screens/ はgitにコミットされない

`screens/` は `src/private/.gitignore` で除外されている
（`src/private` はサブモジュールなので、ルートの `.gitignore` では効かない）。

理由は容量である。実測でスクリーンショットが保存資料の**97%**を占める
（1スキー場・1シーズンで約8MB、テキスト系は0.35MB）。対象スキー場は約400件
あるので、コミットすると1シーズンで3GBを超える。

**スクリーンショットは抽出→監査サイクル中の作業資料であり、成果物ではない。**
恒久的な証拠は `visible-text.txt` / `tables.md` / `page.html`
（`metadata.json` の `sha256_page_html` 付き）が担い、これはコミットされる。
画像が必要になれば `capture-sources.mjs` の再実行で作り直せる
（そもそも1年後には料金自体が変わっているので取り直すことになる）。

**ローカルには残るので、抽出・監査・人間の目視確認は通常どおり行う。**
「gitに無いから見なくていい」ではない。

### screens/ — タイル分割スクリーンショット

**フルページ1枚をモデルに渡しても読めない。** モデルに渡す画像は長辺
1568pxに縮小されるため、実測で 1280×7785px が 329×2000px になり、
料金表の数字が判別できなくなる。そこで固定高さのタイルも保存する
（1280×1400px なら長辺1400px < 1568px で**縮小がかからない**）。

**タイルは必ず全枚数に目を通す。** DOM構造を一切見ない仕組みなので、
表・箇条書き・**バナー画像**・canvas・CSSで組まれたレイアウトに等しく効く。

これが重要なのは、**画像内の料金が `visible-text.txt` に一切現れない**
ためである。実例（めがひら）: 「こどもデー 小学生以下 ¥1,000（入場料￥600込）」
「サンフレッチェ応援デー 大人¥5,000 子供¥1,000」
「ドラゴンフライズ応援デー ¥3,400」「雪マジ 19-22歳 リフト券0円」は
すべてバナー画像内のテキストで、テキスト検索では**0件**である。
タイルを見なければこれらを丸ごと落とす。

### 読む順序とコスト（重要）

保存資料は**安いものから読み、必要になるまで高いものを開かない**。

| 資料 | 目安 | 扱い |
| --- | --- | --- |
| `visible-text.txt` | 数KB | **最初に読む。** 大半の料金・条件・注記がここにある |
| `tables.md` | 数KB | 表の金額はここで確定させる |
| `screens/*.jpg` | 判読可能なタイル | **全枚数に目を通す。** 画像内の料金・レイアウトの確認 |
| `downloads/*.pdf` | — | Readツールで直接読む（下記） |
| `page.html` | **`visible-text.txt` の10倍以上** | 原則読まない。テキスト・表・画像のどこにも現れない情報（属性値・非表示要素）が必要になったときだけ |
| `screens/full.jpg` | フルページ | **モデルは読まない。** 縮小されて判読できない。人間の確認用 |

### PDFの扱い

**Readツールが直接読める。変換は不要。**

```
Read(file_path: ".../downloads/price.pdf", pages: "1-5")
```

テキストが1文字も埋め込まれていないスキャン画像PDFも読める
（実例: 紋別市営大山スキー場の料金案内PDFは `/Font` を持たず
`pdftotext` の抽出文字数が0だが、Readでは吹き出し内の小さい文字まで判読できた）。

ただし**PDFの細部の読み落としには注意する**。上記PDFでは
「ファミリー割引10%」の近くに小さく **「割引はシーズン券のみになります」**
と書かれており、これを読み落とすと**対象外の割引を通常券の割引として
記録してしまう**。10ページを超えるPDFは `pages` を分けて読む。

### URL登録ファイルの形式

**スキー場1件＝1ファイル**。ファイル名 `{ski-resort-id}.json` が
スキー場IDの正本なので、**JSON内にスキー場IDもスキー場名も持たせない**
（IDの二重管理を避ける）。

**URLはシーズンに紐づけない。** 登録するのは「このスキー場の料金はここを見れば
分かる」という*場所*であり、公式サイトは同じURLの中身を毎シーズン更新する。
シーズンが変わったら**同じURLを再取得する**ので、登録ファイルは
シーズンをまたいで使い回す恒久的なリストとする:

```json
{
  "description_ja": "〇〇スキー場のリフト券料金の情報源ホワイトリスト",
  "urls": [
    { "url": "https://example.com/ticket/", "label_ja": "リフト券料金ページ", "added_at": "2026-07-18" }
  ]
}
```

`urls[]` は `{ url, label_ja, added_at }` のオブジェクト、または単なるURL文字列。
`label_ja` には「そのURLから何を取るつもりか」を書く。
`added_at` は**そのURLを情報源として登録した日**（シーズンとは無関係）。
新規スキー場は `templates/source-urls.template.json` をコピーして作る。
サイトのリニューアル等でURLが変わった場合は、シーズン別のブロックを追加せず
**同じ `urls` を編集する**（追加・差し替え。変更履歴はgitに残る）。
出力JSONの `resort.name_ja` / `prefecture` は登録ファイルではなく、
保存資料または既存のスキー場マスタから取る。

### シーズンをどこで確定するか

シーズンは**URLの属性ではなく、取得してきた料金データの属性**である
（「この6,000円はいつの料金か」を明確にするために必要）。

| | シーズン |
| --- | --- |
| URL登録ファイル | 持たない（URLは普遍） |
| 保存資料 `{resort}/sources/{season}/` | 持つ |
| 出力JSON `{resort}/tickets/{season}.json` | 持つ |

`--season` は**保存先の指定＝取得前の宣言**であり、URLの絞り込み条件ではない。
**人間の宣言を信じてはいけない。** 運用は毎年10〜11月に登録URLを一括で
取り直す形になるが、11月時点では公式サイトがまだ前シーズンの料金を
表示していることが普通にある。それを新シーズンとして保存すると、
**前シーズンの料金が新シーズンのデータとして確定してしまう。**

そこで `capture-sources.mjs` は取得後に**内容からシーズンを自動判定し、
宣言と照合する**（`scripts/seasonDetect.mjs`）。

#### 判定の主軸は「日付＋曜日」

「12/26（金）」のような表記は年が変われば曜日も変わるため、**2件以上あれば
シーズンがほぼ一意に決まる**。実測（めがひら）では日付＋曜日が23件あり、
`2025-2026` だけで全件成立し他の年は全件不一致だった。

重要なのは、**料金ページ自体には年号が1件も無かった**ことである。
営業時間ページとイベントページの日付から確定できた。
**これが複数URLを登録しておく価値でもある。**

補助的に年号の直接表記も使う: `2025.12～2026.3` / `2025-26シーズン` /
`令和7年度` / 単独の西暦。

#### 判定結果と挙動

| 判定 | 条件 | 挙動 |
| --- | --- | --- |
| `match` | 判定＝宣言 | 続行 |
| `mismatch` | 判定≠宣言 | **警告＋異常終了（exit 3）**。前シーズンのままの可能性 |
| `conflicting` | ページ間で年が矛盾 | **警告＋異常終了**。一部のページだけ更新済みの可能性 |
| `undetermined` | 日付も年号も無い／絞れない | **警告＋異常終了**。人間の確認が必要 |

**異常終了したら抽出に進んではいけない。** 警告文に、どのページが何年を
示しているかがページ単位で出るので、それを見て判断する。

`conflicting` は11月に実際起きうる最も危険なケースである
（イベントページは更新済みだが料金ページは前シーズンのまま）。
気づかないまま確定すると、料金だけ古いデータができる。

`undetermined` の場合、**人間が公式サイトを見れば分かることがある**。
確認して正しければ `--accept-season` を付けて再実行する
（このフラグを付けたことは `manifest.json` の
`season_check.accepted_by_human` に記録される）。

#### 判定結果は manifest に残る

```json
"season_check": {
  "declared": "2025-2026",
  "detected": "2025-2026",
  "verdict": "match",
  "basis": "日付＋曜日 23件が全件一致（他の年は不一致）",
  "weekday_pairs": 23,
  "by_page": { "page-001": { "weekday_pairs": 0, ... } }
}
```

監査担当はこれを独立に検証できる。

#### 出力JSONの `season` にも根拠を必須にしている

`season.source_refs` は**必須**（schemaとcoverageチェックで強制）。
「2025-2026 と判断した根拠はこの保存資料」を書けなければ確定させない。
以前はここだけ無検証で、他の確定情報が全て `source_refs` 必須なのに
**最も重要な前提であるシーズンだけが推測可能**という穴になっていた。

## 入力

ユーザーから以下を受け取る（不足があれば作業前に確認する）:

1. **スキー場ID** — **既存のスキー場マスタ `SkiResort.id` と同じ値を使う**
   （例: `megahira-onsen-megahira`）。独自のスラッグを作らない。
   IDが分からない場合は `src/private/data/SkiResortNameAliases.json` などの
   名寄せ辞書でスキー場名から引く。**ここを合わせないと、リフト券データを
   スキー場詳細画面に紐づけるためのエイリアス表がアプリ側に必要になる**
   （実際に一度そうなった。IDを揃えて解消済み）
2. **スキー場名**
3. **対象シーズン**（例: `2025-2026`）
4. **公式URL一覧** — `lift-ticket-source/{ski-resort-id}.json` に登録済みなら
   それを使う。新規ならユーザー提示のURLを同ファイルへ追記
   （ファイルが無ければテンプレートから作成）してから開始する
5. **出力先**（省略時は上表のデフォルト）
6. **区分**: `新規作成` / `更新` / `監査のみ`

## 絶対原則

### 0. シーズン券は収集対象外

このSkillが扱うのは、日券・時間券・回数券・ナイター券・複数日券・
エリア券・セット券など、利用日を指定して購入するリフト券だけとする。
シーズン券の価格・申込方法・利用規約・購入者特典・保有者限定割引は収集しない。

- **滑走を目的としない券（観光用ゴンドラ券・歩行者用乗車券）も収集対象外。**
  このデータはスキー・スノーボードで滑る人の料金比較に使うため、
  滑走できない券は記録しない（`sightseeing_pass` / `skiable` のような
  フィールドは持たない）
- シーズン券専用URLをURL登録ファイルに登録しない
- 通常券ページからシーズン券専用ページへリンクされていても取得しない
- 1ページに通常券とシーズン券が併記されている場合は通常券部分だけを抽出する
- 保存資料にシーズン券の記載が偶然含まれていても、JSON・監査・未解決事項へ
  転記しない

### 1. 推測禁止

公式資料に書かれていない条件・金額を推測しない。特に以下を一般常識で補完しない:
子供・シニアの年齢 / 年齢と学校区分の対応 / 未就学児の無料条件 /
平日・休日の定義 / 年末年始料金 / Web価格 / 割引の併用可否 / 必要な証明書 /
利用可能エリア / 券の有効時間 / ICカード費用。

不明な内容は `null`・空配列・`unknown`、または
`data_quality.unresolved_questions` へ記録する。
画像の文字が判読できない場合は `unknown`（`other` というラベルは全群で廃止）
（詳細は `references/extraction-rules.md`）。

### 2. シーズンを混ぜない

`1スキー場 × 1シーズン × 1JSON`。古いシーズンの料金を対象シーズンの
JSONへ混入させない。資料が別シーズンのものしか無い場合は抽出せず、
未解決事項として記録する。

### 3. 情報源はユーザー指定URLのホワイトリストのみ

検索エンジンで情報源を探さない。指定URLから**直接リンクされる**次の公式資料
のみ、料金確認に必要な場合に限り追加取得できる:
公式料金PDF / 公式料金表画像 / 公式オンライン販売ページ /
公式キャンペーンページ / 公式利用規約 / 料金表示に使われる公式APIレスポンス。
追加取得したURLは必ず `sources`（`linked_from_source_id` 付き）と
manifest に記録する。

### 4. 証拠を保存する

URLを毎回直接見に行く運用にしない。最初に `capture-sources` で保存し、
抽出担当と監査担当は**同じ保存資料**を参照する。料金計算に影響する全データに
保存資料へつながる `source_refs` を付ける。

### 5. 標準ラベルは taxonomy.json だけで管理

公式名称（`official_label_ja`）と機械判定用ラベルを分離する。
類義ラベルの新設禁止（`web_discount` 等はすべて `online_purchase`）。

**`taxonomy.json` はラベル1件ごとに定義を持つ**（`definition_ja` / `includes_ja` /
`excludes_ja` / `official_examples_ja` / `decision_rule_ja`）。
**ラベルを選ぶ前にその定義を読むこと。** 名前から意味を推測しない。

**taxonomyに無い概念が出たら、勝手にラベルを追加しない。**
★**`other` というラベルは全群で廃止した。** ラベル体系は公式資料に出てくる概念を
網羅しているはずなので、当てはまらないものが出たら**ラベル体系が不足している**
ということである。その場合は **`unknown` を使い、公式表記をそのまま
`official_label_ja` に写し、なぜ確定できなかったのかを `description_ja` に書く。**
`check-taxonomy.mjs` が `unknown` にした全項目を
「どのパスを・公式表記が何で」の形で集計し警告する:

```
[unknown] /offers/3/eligibility_conditions/0/type — 公式表記「〇〇割引」
WARNING unknown にした項目が 3 件あります。完了報告の「unknown にした項目」に、
        項目・公式表記・確定できなかった理由を必ず記載してください
```

ラベル体系そのものの健全性は `scripts/check-taxonomy-integrity.mjs` が検証する
（schemaのenumとtaxonomyの一致・全群が実際に検証されているか・定義の記入状況）。
**schemaやドキュメントにラベルを直接書き足してはいけない**

## 2段階のサブエージェント構成

サブエージェント（Task/Agent機構）が利用可能な場合、**必ず**次の2段階に分ける。
**抽出した本人に検算させてはいけない。**

### なぜ2段階か（取得と抽出を分けない理由）

取得を独立した段にすると、その担当は「どのシーズンの料金が載っていたか」
「抽出担当が確認すべき箇所はどこか」を報告するために**資料を読む**ことになる。
そして次の段が**同じ資料を最初から読み直す**。引き継ぎメモは読んだ結果の
劣化コピーにすぎず、その作業はやり直される。

さらに、分離すると取得担当は「どのリンク先PDFを `--download` すべきか」を
**抽出に何が必要かを知らないまま**判断しなければならない。統合すれば
「料金表が画像だからPDFが必要だ」と気づいた本人がその場で取りに行ける。
**取得の判断は抽出の必要から導かれる。**

一方、独立性の肝は「**抽出者と監査者が別**」であることだけで、
取得の分離はこれに寄与していない。

### Stage 1: Capture & Extraction Agent（取得＋抽出）

**読むもの**: `references/data-model.md` / `references/extraction-rules.md` /
`references/taxonomy.json` / `templates/lift-ticket.template.json`。
`examples.md` は書き方に迷った箇所だけを引く。
**`lift-ticket.schema.json` は読まない**（構造違反は機械検証が検出する）。

1. `scripts/capture-sources.mjs` で登録URLを取得・保存する

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/capture-sources.mjs \
     --resort <ski-resort-id> --season 2025-2026 --from-registry
   ```

   `--from-registry` で登録URLを**全件**取得する（URLはシーズンに紐づかない）。
   `--season` は保存先の指定
2. `manifest.json` と各 `metadata.json` を確認する。取得失敗・空ページ・
   リダイレクト先が非公式サイトでないかを見る
3. 保存資料を**1回だけ**読む（`visible-text.txt` → `tables.md` →
   `screens/*.jpg` 全枚数）。**画像内の料金はタイルでしか見えない**
4. 料金PDF・料金画像が必要だと分かったら、その場で追加取得する。
   `--from-registry` を付けず `--url` / `--download` ＋ `--linked-from` で
   個別に指定する（登録URLの二重取得を避ける）。PDFはReadで直接読む
5. **`capture-sources.mjs` のシーズン判定に従う。** `match` 以外
   （`mismatch` / `conflicting` / `undetermined`）で異常終了した場合は
   **抽出に進まない**。警告文のページ単位の内訳を見て、前シーズンのままなのか、
   一部だけ更新されているのか、判別不能なのかを報告する。
   判別不能な場合は人間に確認を依頼する（人間が公式サイトを見れば
   分かることがある）
6. `templates/lift-ticket.template.json` を起点に草案を作る。
   **`season.source_refs` に「このシーズンだと判断した根拠」を必ず入れる**
   （`manifest.json` の `season_check` が根拠にしたページを使う）。公式名称・金額・
   年齢区分・学校区分・対象日・利用期間・販売期間・購入経路・地域条件・
   証明書・追加料金・グループ条件を抽出し、標準ラベルへ分類し、
   全確定情報に `source_refs` を付ける。
   **営業時間・ナイター営業日・定休日を `operating_hours` に構造化する**
   （料金だけでなく「その日の営業時間・ナイターの有無」に答えるため。
   また1日券が何時間滑れるかの算出にも使う）
7. シーズン券および購入者・保有者向け特典は抽出しない
8. 草案は `{season-id}.draft.json` として保存する（本番パスに直接書かない）
9. 機械検証3本を実行し、エラーを修正する

**シーズン券専用ページ・PDF・申込フォームは取得対象から除外する**
（`capture-sources.mjs` が正規表現でも弾くが、判断は担当が行う）。

### Stage 2: Independent Audit Agent（独立監査）

**読むもの**: 保存資料 / 草案JSON /
`references/extraction-rules.md` の「Stage 2 監査チェックリスト」/
`references/taxonomy.json`。
**`data-model.md`・`examples.md`・`lift-ticket.schema.json` は読まない**
（構造とラベルの妥当性は機械検証3本が通過済みであることを前提とする）。

**渡してよいのは保存資料と草案JSONだけ。** 抽出担当の思考過程・作業メモ・
「ここは自信がない」といった申し送りは渡さない。渡すと同じ思い込みを
引き継いで独立性が消える。

- 草案を保存資料と**独立に**照合する。本番JSONを直接編集せず、
  監査レポートを `{resort-id}/audits/{season-id}.audit.json` に出力する
- HTML由来の表の金額は `tables.md` と機械的に突き合わせる
  （行列の取り違えはTSV化で構造的に防いでいる）
- **`screens/*.jpg` を全枚数見て、画像内の料金が草案に反映されているかを
  確認する。** ここが最も落ちやすい（テキスト検索では検出できない）
- 最低限の確認項目（詳細チェックリストは `references/extraction-rules.md`）:
  画像内の料金・注釈の見落とし / PDF別ページの条件 /
  金額・年齢・日付・販売経路の証拠との一致 /
  全確定情報のsource_refs / 未登録ラベル / 類義ラベルの表記揺れ /
  公式名称と標準ラベルの混同 / Web割引の `online_purchase` 統一 /
  事前購入の `advance_purchase` 分離 / 地域割引の構造化 /
  居住・在勤・在学の区別 / レディースデーの日付・対象者条件 /
  特定日料金と通常料金の区別 / `unknown` の正しい使用と公式表記の記録 /
  保証金と手数料の区別 / 動的価格を固定保存していないか /
  オンライン券の購入期限（当日可・期限あり・記載なし）の分類 /
  学生区分の範囲（大学院生等）の明記どおりの反映 /
  共通券の相手スキー場明記 / セット券の `included_items` 構造化 /
  シーズン券やその購入者・保有者向け特典が混入していないか
- レポート形式:

```json
{
  "status": "passed | failed | needs_review",
  "errors": [],
  "warnings": [],
  "missing_evidence": [],
  "possible_misreads": [],
  "taxonomy_addition_candidates": [],
  "suggested_fixes": []
}
```

### 最終統合

監査で問題が見つかった場合、**最終統合担当（メインエージェント）**が証拠を
確認して草案を修正する。複数サブエージェントに同時に本番JSONを編集させない。
修正後に再検証し、通過した草案を本番パス
`{resort-id}/tickets/{season-id}.json` へ確定する。

**修正はすべて差分編集（Edit）で行い、JSON全体を再出力しない。**
この出力JSONは1スキー場で1,500行規模になる。1件の金額を直すために全体を
書き直すと、それだけで数分と大量の出力トークンを消費し、無関係な箇所に
新しい誤りが混入する余地も生まれる。指摘が10件あっても、
**該当する10箇所だけをEditする**。

同じ理由で、Stage 1が草案を作る際もセクション単位で書き進め、
一度書いた部分を整形目的で書き直さない。

## 実行手順（必須の順序）

1. **入力確認**: スキー場ID・名称・対象シーズン・URL一覧・出力先・区分を確認。
   URLが未登録なら `lift-ticket-source/{ski-resort-id}.json` へ登録する
2. **既存確認**: 既存の出力JSON・保存資料・監査レポートの有無を確認する
   （更新・監査の場合は差分の起点にする）
3. **Stage 1**: Capture & Extraction Agent を実行し、取得・保存資料の確認・
   抽出・機械検証まで行って `{season-id}.draft.json` を作る

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/validate-lift-ticket.mjs <draft.json>
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/check-taxonomy.mjs <draft.json>
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/check-lift-ticket-coverage.mjs <draft.json>
   ```

4. **Stage 2**: Independent Audit Agent を実行する
   （渡すのは保存資料と草案JSONだけ）
5. **修正**: 監査結果に基づき最終統合担当が証拠を確認して**差分編集**で修正し、
   3の機械検証を再実行する
6. **シナリオテスト**: 完成したJSONに対し「指定日の料金」「年齢・学校区分ごとの
   料金」「購入経路による差」「地域条件」「グループ最安」の具体的な問い合わせを
   最低5件作り、JSONだけから機械的に答えられるか確認する。日付ベースの照会は
   必ず `lookup-price.mjs` を実際に実行して確認する:

   ```bash
   node .shared/skills/collect-ski-lift-ticket-pricing/scripts/lookup-price.mjs \
     <tickets/.../2025-2026.json> --date 2026-01-01 [--audience adult] [--json]
   ```

   平日・祝日・年末年始・特定日（レディースデー等）を最低1日ずつ含めること。
   答えられない場合、資料に情報があるなら抽出漏れとして修正、資料に無いなら
   `unresolved_questions` へ記録する
7. **最終検証と完了報告**: 3スクリプトの最終実行結果を確認し、
   下記フォーマットで報告する

## 完了報告フォーマット

```text
作成・更新したファイル:
対象スキー場 / 対象シーズン:
ユーザー指定URL / 追加取得した公式URL:
保存したページ数・表の数・スクショタイル数:
読んだPDF数（うちスキャン画像PDF）:
画像内から読み取った料金（テキストに無かったもの）:
登録した件数: audience / geographic area / calendar / product / channel / offer / party rule / fee
機械検証3本の結果:
独立監査の結果:
シナリオテストの結果:
判読不能箇所:
unknown にした項目（項目のパス・公式表記・確定できなかった理由・ラベル追加の提案）:
未解決事項:
人間による確認が必要な項目:
```

## Skill自体のテスト

Skillの検証ロジックを変更した場合は必ず実行する:

```bash
node .shared/skills/collect-ski-lift-ticket-pricing/tests/run-tests.mjs
# Playwright取得処理まで確認する場合:
node .shared/skills/collect-ski-lift-ticket-pricing/tests/run-tests.mjs --with-capture
```

正常fixtureが3スクリプトすべてを通過し、異常fixtureが意図したスクリプトで
失敗することを確認する（`tests/README.md` 参照）。
