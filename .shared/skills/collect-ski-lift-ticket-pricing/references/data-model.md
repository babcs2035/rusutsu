# リフト券料金JSON データモデル

正式な制約は `lift-ticket.schema.json`、使用可能ラベルは `taxonomy.json` が正本。
このドキュメントは各セクションの意味と設計意図を説明する。

## 全体構造

```json
{
  "schema_version": "1.0.0",
  "taxonomy_version": "2.0.0",
  "resort": {},
  "season": {},
  "sources": [],
  "audiences": [],
  "calendars": [],
  "operating_hours": [],
  "areas": [],
  "products": [],
  "channels": [],
  "offers": [],
  "party_rules": [],
  "fees": [],
  "calculation_policy": {},
  "data_quality": {}
}
```

単位は必ず `1スキー場 × 1シーズン × 1JSON`。
ここでいうシーズンは料金データの対象期間を表す。シーズン券そのものは
収集・記録の対象外。

## このJSONが答えるべき2つの問い

**① 「いつ、誰が、どれくらい滑るには、いくらかかるか？」**

- **いつ** — 日付（平日・休日・年末年始・特定日・**定休日**を含む）
- **誰** — パーティ構成（小学生1人、大学生23歳1人、大人50歳1人、60歳1人…）
- **どれくらい滑るか** — 何時間滑りたいか / 何時から滑るか / ナイターだけか

出すのは**要件を満たす券の中の最安**。5時間滑りたいなら5時間以上滑れる券から選び、
その日のキャンペーン券が通常券より安ければそちらを出す。

**② 「その日の営業時間、ナイターの有無は？」**

この2つは独立していない。**①の「どれくらい滑れるか」は営業時間で決まる**
（1日券が何時間なのかは営業時間が分からないと確定しない）。だから
`operating_hours` は②の答えであると同時に①の前提でもある。

実例（めがひら）: 営業時間が 08:00〜17:00 = ちょうど9時間で、最大券種が
**9時間券**（1日券が存在しない）。券の時間は営業時間から決まっている。

そのうえで次の問い合わせにも機械的に答えられることを目的とする:
Web・前売り割引 / 子供デー・レディースデー / 道民割・県民割・市民割・町民割 /
居住・在勤・在学の違い / 学生割・宿泊者割・会員割 /
幼児無料・親子券・ファミリーパック / ICカード保証金・発行手数料 /
グループ全体での最安購入方法 / どこで・いつまでに購入する必要があるか。

## sources（保存資料）

capture-sources が保存した証拠へのポインタ。料金計算に影響する全データは
`source_refs` でここの `id` を参照する。

- `url` / `path`: どこから取ったかと、どこに保存したか。**どちらも必須**
  （根拠を後から人間が目で確認できないJSONにしない）。
  **資料の種類を分類するフィールドは持たない** — 拡張子が表す
  （`.html` / `.pdf` / `.png` / `.json`）。かつて `type`
  （`html | pdf | image | api_response | screenshot | text`）があったが、
  実データ118件すべてで拡張子と1対1に対応しており何も足していなかった。
  「画像/PDFの根拠には path が必須」という検査も、**全資料に path を必須**に
  変えたほうが強く、種類の判定を必要としない
- `user_specified`: URL登録ファイルに書かれたURLなら true。
  **そのページに貼られたリンクを辿って取った資料は false** とし、
  `linked_from_source_id` でリンク元の source を指す。
  `capture-sources.mjs --follow-links` が manifest に
  `user_specified` / `linked_from` を記録するので、それを写す
  （どのページが指定URLで、どれが辿った先なのかを後から追えるようにする）
- **抽出担当の確信度ラベル（`confidence` / `reading_confidence`）は持たない。**
  「自信がない」と申告されても人間はどこを見ればよいか分からないため、
  `data_quality.human_review_required` に「何を・なぜ・どこを見れば確認できるか」を
  書くことに一本化した

## audiences（人物区分）

基本的な人物区分のみを置く: 未就学児 / 小学生 / 中学生 / 高校生 / 大学生 / 大学院生
大人 / シニア など。ラベルの正本は `taxonomy.json` の `school_levels`。

**「50歳の大人」「23歳の大学生」という入力から区分を解決できる状態にする。**

- **年齢条件**（`age_min` / `age_max`）と**学校区分**（`school_levels`）は
  別フィールド。公式資料が「小学生」としか書いていなければ年齢は入れない
  （年齢↔学校区分の対応を常識で補完しない）
- **`is_default`（重要）** — 「どの条件にも当てはまらなければこの区分」を1件だけ置く。
  多くのスキー場の「大人」がこれ。**「中学生以上」を `school_levels` の列挙で
  表そうとすると（中学・高校・大学・大学院・短大・専門・社会人…）必ず網羅漏れが
  起きる**ため、基準区分はデフォルトとして扱う。1スキー場につきちょうど1件
  （taxonomyチェックで強制）。デフォルト以外は必ず判定条件を持たせる
- **offer側に対象者区分の記載が何もない場合**は、`audience_ids` を空配列にせず
  `is_default: true` の人物区分へ紐付ける（通常は「大人」）。
  何も当てはまらない人が買う基準区分を適用するためであり、年齢・学校区分を
  推測しているのではない。「全区分共通」と明記されている場合だけは、明記された
  全区分へ紐付ける
- **障がい者本人・公式に割引対象となる介護者**は専用audienceとして分ける。
  `is_disability_qualified: true` を付け、`base_audience_id` で通常の大人・子供等を
  参照する。照会では専用offerがあれば適用し、選んだ券種に専用offerがなければ
  `base_audience_id` の通常料金へフォールバックする。障がいの種類・介護者条件・
  必要証明は公式表記のまま `official_label_ja`、`notes_ja`、
  `requirements` に残す。人物区分そのものの料金なので `discount_reasons` は空にし、
  Web・前売等の別の割引理由が重なる場合だけその理由を追加する
- **`school_levels` は「上が学校区分で閉じている」場合だけ列挙する**
  - 「子供：小学生まで」→ `["preschool", "elementary_school"]`（上が小学生で閉じている）
  - 「中学生・高校生」（中人）→ `["junior_high_school", "high_school"]`（両端が閉じている）
  - 「学生（大学生・大学院生）」→ `["university", "graduate"]`
  - **「中学生以上」「高校生以上」は列挙してはいけない。** 社会人を含むため
    学校区分では表せない。`school_levels` を空にして `is_default: true`、
    上限が年齢で示されていれば `age_max` を使う
    （例: 「おとな（中学生〜59歳）」→ `school_levels: []`, `age_max: 59`, `is_default: true`）
  - 「シニア：65歳以上」→ `age_min: 65`（`school_levels` は空）
- **学校区分から年齢を推測してはいけない。** 「中学生」から `age_min: 13` と書くのは
  絶対原則1違反。年齢は公式表記に数値がある場合のみ入れる
  （`check-taxonomy.mjs` が公式表記に無い年齢を検出してエラーにする）
- `school_levels` は **未就学児 / 小学生 / 中学生 / 高校生 / 大学生 / 大学院生**
  の6区分＋`unknown` のみ。**学生割引の範囲だけは要注意**で、
  短大生・専門学校生・高専生が公式に明記されている場合は
  **ラベルを追加せず `data_quality.human_review_required` に公式表記とともに記録して
  人間へ通知する**（`check-taxonomy.mjs` が公式表記から機械的に検出して強制する）。
  公式表記が「学生」だけで範囲の記載が無ければ `unresolved_questions` へ
  （含む区分を勝手に広げない・狭めない）。詳細は `taxonomy.json` の
  `groups.school_levels.labels.university.decision_rule_ja`
- 「県民の大人」「市民の小学生」のような地域条件込みのaudienceを作らない。
  地域条件は offer の `target_qualification` で表現する。**性別も audiences に入れない**
  （audiences は互いに排他的な料金表の行で、性別はそれと直交して交差するため、
  混ぜると「女性の大人が通常料金を買えない」という壊れ方をする）。
  性別は `target_genders` で表す
- 年齢区分が意図的に重複する場合（例: 「60歳以上」と「70歳以上」が併存）は`allow_age_overlap: true` を付ける

## calendars（適用日）

平日 / 休日 / 年末年始 / 特定日などの日付集合。
`included_day_types`（曜日・祝日等）・`included_dates`（明示日）・`included_date_ranges`（期間）・
`excluded_dates`（除外日）・`excluded_date_ranges`（除外期間）の組み合わせで表す。
具体的な書き方は `examples.md` の「カレンダーの指定方法」を参照。

かつて `calendar_type` という分類フィールドがあったが、中身から導出でき、しかも
実データで**構造が同一なのに別ラベルが付く**（`included_day_types:["special"], included_dates:3` が
`special_day` と `date_list` の両方で使われていた）など恣意的だったため廃止した。

**目的は「ユーザーが日付を入力したら料金が引ける」こと。**
`scripts/lookup-price.mjs --date YYYY-MM-DD` が以下の規則で日付を解決する:

- **平日・休日は標準カレンダー準拠がデフォルト**:
  `included_day_types: ["weekday"]` = 月〜金かつ祝日でない日、
  `saturday` / `sunday` / `public_holiday` = 標準カレンダーどおり
  （祝日は `scripts/jp-holidays.mjs` が振替休日・国民の休日込みで計算する）。
  公式資料が独自の定義をしている場合のみ、`included_dates` / `included_date_ranges` /
  `excluded_dates` / `excluded_date_ranges` の明示指定で上書きし、
  `notes_ja` に公式表記を写す
- ★**最重要の落とし穴: `weekday` は年末年始を飲み込む。**
  `weekday` は「月〜金かつ祝日でない日」なので 12/29(月) や 1/2(金) にも一致する。
  **多くのスキー場で年末年始は休日料金なので、年末年始を別カレンダーで定義しないと
  安すぎる料金を提示する。** 公式に期間が書かれていれば
  休日側へ `year_end_new_year` ＋ `included_date_ranges` を設定し、同じ期間を
  平日側の `excluded_date_ranges` にも設定する。単発日なら休日側の
  `included_dates` と平日側の `excluded_dates` をペアにする。
  記載が無ければ `unresolved_questions` に記録する
  （taxonomyチェックが未定義を検出してエラーにする）
- **年末年始は必ず公式指定の日付**:
  `included_day_types: ["year_end_new_year"]` は
  単独では日付に一致しない。公式資料の期間を `included_date_ranges` で明示する。
  **期間はスキー場ごとに違うため「12/29〜1/3」のような一般的な期間を推測しない**
- **特定日（レディースデー等）も明示日付**: `included_dates` に列挙する
- **包含はOR**: 1つのcalendar内では、`included_day_types` /
  `included_dates` / `included_date_ranges` のどれか1つに一致すれば対象日になる。
  例: 土日祝料金を年末年始にも適用するなら、土日祝calendarに
  `included_day_types: ["saturday","sunday","public_holiday"]` と
  `included_date_ranges: [{"start":"2025-12-29","end":"2026-01-03"}]`
  を併記し、平日calendarの `excluded_date_ranges` にも同期間を記録する
- **料金区分の移動はexclude/includeを必ずペアにする**:
  暦上は平日だが休日料金にする日のように、通常区分から別区分へ日を移す場合、
  元区分の `excluded_dates` / `excluded_date_ranges` と、適用先区分の
  `included_dates` / `included_date_ranges` を必ず両方書く。
  暗黙の優先順位はないため、片方だけでは両料金が同時に一致する
- **割引日は通常区分から除外しない**:
  `kids_day` / `special_day` 等は通常料金を置き換える日付区分ではなく、
  通常料金に重なる割引候補なので、通常の平日・休日calendarから除外しない。
  一致した通常料金と割引料金を候補に残し、利用可能な安い料金を選ぶ
- **除外は包含より強い**: 同じcalendarの `excluded_dates` または
  `excluded_date_ranges` に含まれる日は常に不一致。単発なら前者、連続期間なら後者を使う

## operating_hours（営業時間・ナイター・定休日）

**「その日の営業時間・ナイターの有無」の答えであり、同時に「1日券が何時間
滑れるか」の算出元でもある。**

日付条件は `calendar_ids` で `calendars` を参照する（仕組みを増やさない）。

- `hours_type`: `regular`（通常営業）/ `night`（ナイター）/ `early_morning`（早朝営業）
  / `closed`（定休日・休業）/ `unknown`（営業していそうだが時間が確定できない）。
  ラベル群は `hours_bands` で、**products の `covers_hours_types` と同じ語彙を共有する**
  （かつて `operating_hours_types` と `covers_hours_types` の2群に分かれていたが、
  regular / night / early_morning が完全に重複しており、片方だけ増やすと食い違った）。
  **`closed` と `unknown` は operating_hours 専用**
  （「休業日に使える券」は意味を持たないため、券側では使えない）
- `start_time` / `end_time`: **滑走可能な時間帯**。`closed` の場合は null
- `lifts[]`: リフト別の運行時間。`operating: false` で「ナイター時は運休」を表す。
  全体の営業時間しか公表されていない場合は空でよい

**定休日には料金を提示しない。** `hours_type: "closed"` は他の営業時間より優先する。
「毎週火曜定休（12/30は営業）」は
`included_day_types: ["tuesday"]` ＋ `excluded_dates: ["2025-12-30"]` で表す
（`excluded_dates` の日は常に不一致なので「火曜だが営業する」例外になる）。

営業期間外（`season.start_date` より前 / `end_date` より後）も営業していないものと
して扱う。営業期間内でどの `operating_hours` にも一致しない日は「資料から判定
できない」であり、営業しているとみなしてはいけない。

```json
{
  "id": "oh-night", "name_ja": "ナイター営業",
  "hours_type": "night", "calendar_ids": ["cal-night"],
  "start_time": "17:00", "end_time": "21:00",
  "lifts": [
    { "name_ja": "チャレンジリフト", "start_time": "17:00", "end_time": "21:00", "operating": true },
    { "name_ja": "クワッドリフト", "operating": false, "notes_ja": "ナイター時は運休" }
  ],
  "source_refs": ["src-hours"]
}
```

## areas（ゲレンデ内エリア）

「全山共通」「〇〇エリア限定」など、券の利用可能範囲。product が
`area_ids` で参照する。公式資料に範囲の記載が無ければ空のまま
（利用可能エリアを推測しない）。

## products（券種）

「1日券」「4時間券」「ナイター券」「回数券」など、料金以前の券の種類。
`validity.mode`（暦日 / 初回利用からN時間 / 時間帯固定 / ポイント / 回数）と
`hours` / `days` / `points` / `rides` で有効範囲を表す。
券の有効時間が資料に無ければ `unknown` を使う。

**「何時間滑れるか」の算出規則**（「5時間以上滑りたい」への回答に使う）:

| `validity.mode` | 滑走時間 |
| --- | --- |
| `hours_from_first_use` | `hours` をそのまま（初回利用から連続。その日に使い切る） |
| `hours_pool` | `hours`。ただし**複数日に分けて使う券**なので単日の代表にしない |
| `fixed_time_window` | `end_time - start_time`。**開始時刻が固定される制約付き** |
| `calendar_day` / `consecutive_days` / `selectable_days` | **`operating_hours` から算出**（券自体に時間が書かれていない） |
| `rides` / `points` | **時間軸に載らない**。「何時間滑りたい」では比較しない |

**`validity` は「リフトを使える範囲」を表す。パッケージの提供単位ではない。**
「1日セット（リフト4時間券・レッスン・レンタル付き）」の `validity` は
`hours_from_first_use: 4`。`calendar_day` にすると1日券として選ばれてしまう。

### 1日券・複数日券の判定

| | 表現 |
| --- | --- |
| 1日券 | `mode: "calendar_day"`, `days: 1` |
| 連続2日券 | `mode: "consecutive_days"`, `days: 2` |
| 選べる3日券 | `mode: "selectable_days"`, `days: 3`, `usable_within` |
| 25時間券（複数日に分割可） | `mode: "hours_pool"`, `hours: 25`, `usable_within` |

`days` は上3モードで**必須**（taxonomyチェックで強制）。これが無いと
「1日券が欲しい」に答えられない。「当日有効」しか書かれていなければ `days: 1`、
本当に不明なら `mode: "unknown"`（推測しない）。

### usable_within_ja — いつまでに使い切る必要があるか

**分割して使える券だけの概念。** `selectable_days`（選べる5日券）と
`hours_pool`（25時間券）にのみ書く。公式表記をそのまま入れる:

```json
"validity": { "mode": "hours_pool", "hours": 25, "usable_within_ja": "シーズン中有効" }
"validity": { "mode": "selectable_days", "days": 5, "usable_within_ja": "購入日から30日以内の任意5日" }
```

- ★**当日しか使えない券（`calendar_day` / `hours_from_first_use` /
  `fixed_time_window` / `rides` / `points`）には書かない。**
  その日で終わる券に「いつまでに使い切るか」という概念が無い（taxonomyチェックがエラーにする）
- ★**公式資料に記載が無ければ null にし、`human_review_required` に記録する**
  （「シーズン中いつでも」と推測しない）

**日数を構造化するフィールドは持たない。** かつて `usable_within` として
`days_from_purchase` / `days_from_first_use` / `valid_until` ＋ 分類ラベル
`usable_within_types` を持っていたが、**照会にも表示にも一度も使われておらず**
（実データ39券種のうち設定は1件、その中身も「シーズン中有効」＝相対期限なし）、
分類の手間だけが残っていた。購入日基準か初回利用日基準かの判定を機械化する必要が
出たときに、実データを見てから構造を足す。

**`hours_from_first_use` と `hours_pool` の区別が重要。** 25時間券を
`hours_from_first_use: 25` と書くと「初回利用から連続25時間滑れる券」の意味になり、
**1日券や「9時間以上」の候補として誤って選ばれる**。24時間以上を
`hours_from_first_use` にしているとtaxonomyチェックがエラーにする。

### covers_hours_types — この券がどの営業区分の券か（ナイター券の判定を含む）

**1日券・複数日券（`calendar_day` / `consecutive_days` / `selectable_days`）と、
時間帯固定券（`fixed_time_window`）に設定する。** それ以外（回数券・ポイント券・
初回利用からN時間券）は「営業区分」という概念自体が無いので設定しない。

役割はモードによって少し違う:

- **1日券・複数日券**: 「その1券でどの営業区分まで滑れるか」という**カバー範囲**
  （複数指定できる）。券自体に時間が書かれていないため `validity` から導出できない
- **時間帯固定券（`fixed_time_window`）**: 「この券自体がどの営業区分の時間帯か」
  という**その券の分類**（1つだけ）。券自体の `start_time`/`end_time` だけでは
  「ナイター券なのか、それとも通常営業内に収まるゴゴイチ券なのか」を確定できない
  （`operating_hours` の時間帯と突き合わせて判定しようとすると、資料が別ページ・
  別形式で取れることが多く、時間表記が微妙にズレて機能しないことがある）ため、
  券自体にラベルを持たせて直接判定できるようにする

```json
"covers_hours_types": ["regular"]           // ナイターなし1日券
"covers_hours_types": ["regular", "night"]  // ナイター込み1日券
"covers_hours_types": ["night"]             // ナイター単独券（fixed_time_window）
"covers_hours_types": ["regular"]           // 平日ゴゴイチ券（fixed_time_window、通常営業内）
"covers_hours_types": null                  // 資料に記載なし（推測しない。1日券・複数日券のみ許可）
```

**これは導出できない事実なのでフィールドとして持つ**（付帯品・事前購入等は
既存データから導出できるので持たせていない）。1日券・複数日券では `null` を許す
のが重要で、「ナイターが含まれるか書いていない」サイトを `false` と決めつけない。
一方 `fixed_time_window` では**必須**（taxonomyチェックで強制。書き忘れると
下記②の合算でこの券を見つけられない）。

「1日券（ナイターあり）」の解決順:
1. `covers_hours_types` に `regular` と `night` を両方含む1日券
2. 無ければ **1日券 ＋ ナイター単独券（`fixed_time_window` で `covers_hours_types: ["night"]`）の合算**（内訳を出す）
3. ナイター単独券の料金が資料に無ければ**その旨を明示**して代替案を出す

### 1日券が存在しないスキー場

実例（めがひら）: 1日券が無く最長が9時間券。この場合は**最長の時間券で代替**し、
「1日券はありません。最長の9時間券で代替しています」と明示する。

さらにナイター営業日は営業が08:00〜21:00（13時間）あるのに最長券は9時間なので、
**「9時間券では全時間帯をカバーできません」も併記する**。
ナイター単独券の料金が資料に無いことも明示し、料金を推測で作らない。

`fixed_time_window`（例: 平日ゴゴイチ券 13:00〜17:00）は**滑る自由度を狭める制約**
なので、朝から滑りたい利用者の代表候補にしない。ただし利用者が開始時刻を
明示して受け入れた場合は候補になる。付帯品（食事券・温泉）は自由度を狭めないので
安ければ代表になる。

券、その購入者特典、他スキー場のシーズン券保有者向け割引は
products / offers / party_rules のいずれにも記録しない。

**券の分類は `validity` 1軸だけで表す。** かつて `product_type` という別フィールドが
あったが、`validity` から100%導出できる冗長なものだったため廃止した
（実データ19件で検証）。表示用の分類名（「1日券」「4時間券」）も `validity` から導出する。

券の付帯情報は**それぞれ専用フィールドが担う**:

| 概念 | 表す場所 |
| --- | --- |
| ナイターに使えるか / ナイター券かどうか | `covers_hours_types`（**1日券・複数日券・時間帯固定券のみ**） |
| 複数スキー場の共通券 | `shared_with_resorts` |
| 食事・温泉・レンタル付き | `included_items` |
| 利用可能エリアの限定 | `area_ids` |

**これらを1つの分類ラベルに押し込むと「1日券である」という情報が失われる。**
実例: 「ランチパック1日券」を `package`、「2山共通1日券」を `shared_pass` にしていたため、
**「1日券が欲しい」という問い合わせで候補から漏れていた**。

滑走を目的としない券（観光用ゴンドラ券・歩行者用乗車券）は**収集対象外**なので、
滑走可否を表すフィールドは持たない。

- **`included_items`（付帯サービス）**: 昼食付き・温泉付き・レンタル付き等の
  セット券は、含まれるものを `included_items` に構造化する
  （`type` は taxonomy の `included_item_types` の7区分:
  `meal`（食事・食事券・飲み物）/ `bath`（温泉・風呂・サウナ）/ `rental` /
  `lesson` / `parking` / `voucher`（用途が限定されない金額券）/ `unknown`。
  **細かく分けない** — 昼食と食事券、温泉とサウナを分類しても料金計算に効かず、
  判断が揺れるだけだった。中身は `official_label_ja` と `description_ja` に
  公式表記のまま残す）。**公式名称が「パック」「セット券」
  「〇〇付き」を謳っているのに `included_items` が空なら taxonomyチェックが落ちる**
  （何が付くのか分からないと「いくらで何が得られるか」に答えられない）
- **`shared_with_resorts`（単独券と共通券）**: ★**苗場とかぐらのように、
  単独券と共通券の両方を売っているスキー場がある。** この券が他のスキー場でも
  使えるなら、相手スキー場をここに列挙する。
  **空なら単独券、1件以上あれば共通券**（「単独券か共通券か」を表す分類ラベルは
  持たない — この配列が空かどうかで決まる）。
  - `resort_id`: 相手スキー場の `SkiResort.id`。**画面から相手スキー場へ辿るために必須。**
    マスタに無いスキー場なら null にし、`human_review_required` に公式表記とともに記録する
  - `name_ja`: 相手スキー場の名称（公式表記のまま）

  **`validity` は利用単位のまま**（共通1日券なら `calendar_day` / `days: 1`）。
  **相手スキー場側のJSONにも同じ共通券を記載する**こと（1スキー場×1シーズン×1JSONの
  原則のため、共通券は関係する全スキー場のJSONに現れる）。相手側JSONが未作成なら
  `human_review_required` に記録する。

  照会は `lookup-price.mjs --scope single|shared` で絞り込める。
  画面では「このスキー場のみ / 共通券（相手スキー場名）」の切り替えに使う

## channels（購入経路）

その料金をどこで買えるか。**購入場所を分類するラベルは持たない**
（かつて `channel_type` があったが、窓口か券売機かコンビニかを機械的に区別しても
料金の計算には効かない。利用者に必要なのは購入ページのURLと公式の呼び名だけ）。

- `name_ja`: 公式の呼び名をそのまま（「WEBチケットストア」「リフト券売り場」）
- `url`: 購入ページのURL。**`online_purchase` の割引offerが参照するchannelに
  URLが1つも無いと taxonomyチェックが落ちる**（購入ページへ連れて行けない）
- `purchase_deadline_ja`: 購入期限がchannel側に書かれている場合、公式表記のまま

## offers（料金オファー）

1件のofferは「**誰が＋どの券を＋いつ使うか＋どこで買うか＋どの追加条件を
満たすか＋いくらか**」を表す。

- `official_label_ja`: 公式サイト上の名称（例: 「WEB前売スペシャル」）
- **offerの種類を表す分類フィールドは持たない。** かつて `offer_type`
  （`standard | discounted | free | package | dynamic`）があったが、
  `product_type` / `calendar_type` と同じく他フィールドから100%導出でき、
  しかも**実データ39件のうち10件（26%）で複数ラベルが同時に該当**して
  どれを選ぶかが恣意的だった（`discount_reasons` が空で `included_items` を
  持つという同一構造に `standard` と `package` が混在していた）。
  導出先は `moved_elsewhere.offer_type` が正本:
  割引か → `discount_reasons` が空かどうか、
  無料か → `price.amount` が 0、
  パックか → `products.included_items`、
  変動価格か → `price.live_lookup_required` が true
- `discount_reasons`: taxonomyのラベルのみ。複数条件は配列で表し、
  複合ラベルを新設しない（WEB前売 → `["online_purchase", "advance_purchase"]`）。

  ★**各ラベルは `applies_to` で「誰に適用できるか」を宣言している。**
  これが料金の出し方を決める:

  | `applies_to` | 意味 | 料金照会での扱い | 該当ラベル |
  | --- | --- | --- | --- |
  | `everyone` | 誰でも利用できる | **最安なら代表として提示してよい** | `online_purchase` / `advance_purchase` / `special_day` |
  | `party_composition` | パーティ構成から自動判定 | **人数・年齢構成が合えば適用して合計を計算**（`party_rules`） | `family` / `group` |
  | `qualified_only` | 条件を満たす人だけ | **代表にしない。**「〜なら¥X」として別掲、または条件を確認してから出す | `local_resident` / `membership` / `hotel_guest` / `coupon` / `app_registration` / `payment_method` / `prior_purchase` / `unknown` |

  会員でも宿泊者でも地域住民でもない人に会員割引・宿泊者割引・地域割引を代表として
  出すと**誤った金額**になる。一方でファミリーパックは、パーティ構成が入力されて
  いるなら**自動的に計算すべき**もので、「資格を取得しないと使えない割引」とは
  性質が違う。この3つを混ぜないために `applies_to` を持つ。

  ただし、公式名称が「20才」「20歳」等の年齢を示し、対象条件が
  「2005年4月2日〜2006年4月1日生まれ」のような**年度単位の生年月日範囲**
  で定義されている割引は、年齢入力から適用する例外とする。照会で20歳が指定されたら
  その料金を計算へ適用し、厳密な誕生日は入力されていないため、公式の生年月日範囲を
  必ず警告表示する。公式名称の検索用年齢を
  `target_qualification.nominal_age`、生年月日範囲を
  `target_qualification.official_label_ja` に保存する。`nominal_age` は検索用であり、
  実年齢の厳密判定には使わない。アプリ登録・クーポン提示等の付随条件も
  `requirements` に保存して警告へ併記する。単なる会員・宿泊・居住資格は
  この例外に含めず、通常料金を主表示して条件付き料金として別掲する。

  障がい者向け料金も例外で、利用者が障がい者区分を明示して検索した場合は、
  `is_disability_qualified: true` のaudienceに紐づくofferを計算へ適用する。
  障がい者区分を選んでいない人には条件付き候補として表示しない。
  条件付き候補は、現在適用している料金より安くなるものだけを表示する。

  `qualified_only` の理由には **`target_qualification` / `target_genders` の
  いずれか、または `audiences` 側での絞り込みが必須**
  （taxonomyチェックが強制）。書き忘れると「誰でも使える割引」として扱われる
  （実際にその穴があり、会員割引を条件なしで書くと代表として選ばれていた）。
- `audience_ids` / `calendar_ids` / `channel_ids` / `product_id`: 参照で表現
- `target_genders`: 性別による絞り込み（レディースデー等）。**機械的に判定できる
  唯一の絞り込み軸**なので構造化する
- `target_qualification`: 資格による絞り込み（道民割・宿泊者割・会員割・出身者割等）。
  **分類せず、公式表記 (`official_label_ja`) と誰が対象か (`description_ja`) を
  文章で残す。** かつて `geographic_areas`（地域の階層）＋ `area_relationships`
  （居住／在勤／在学）＋ `geographic_levels`（都道府県／市町村）で構造化していたが、
  料金照会の入力は日付・パーティ構成だけで**居住地を受け取らない**ため、
  どれだけ細かく分類しても料金計算に一切効かず、分類の手間と判断の揺れだけが残った。
  「資格が必要だから代表にしない」の判定は `discount_reasons` の `applies_to` が
  担っており、地域の構造は使っていない。
  **このフィールドを省略して「絞り込みが無いoffer」にしてはいけない**
  （対象外の人に安い金額を提示することになる）。
  ここに書かないもの:
  証明書→`requirements[].proof_ja`（持ち物であって絞り込み条件ではない）、
  同行者構成→`party_rules`、年齢・学校区分→`audiences`、対象日→`calendars`、
  利用時間帯→`products.validity`、購入期限→`purchase_deadline`。
  例外として、年度生まれキャンペーンの公式名称にある検索用年齢だけは
  `nominal_age` に保存する。厳密な条件は必ず公式の生年月日範囲で警告する
  行き先の正本は `taxonomy.json` の `moved_elsewhere.target_restrictions`
- `sales_period` / `use_period`: 販売期間と利用期間を分離する
- `purchase_deadline`: **いつまでに買う必要があるか**
  - `same_day_allowed`: 利用日当日に買えるか。`true`（「当日OK」「利用15分前まで」）/
    `false`（前日以前＝前売り）/ `null`（**公式に記載なし**。推測しない）
  - `days_before_use`: 利用日の**何日前**までに買う必要があるか（1日単位）。
    「前日まで」＝1、「3日前まで」＝3、当日購入可なら 0 か null
  - `deadline_date`: 「〇月〇日まで販売」のように利用日と無関係な固定期限
  - `official_text_ja`: 期限の公式表記そのまま（「利用日前日23:59まで」）

  **`days_before_use` は「あと何日あるので買えるか」の判定に使う。**
  `lookup-price.mjs --date 2026-01-08 --today 2025-12-25` は
  「あと13日以内に購入すれば買えます」、`--today 2026-01-08` なら
  「利用日の1日前までに購入が必要ですが、あと0日しかありません」を返す。

  **当日内の分単位の期限（「利用15分前まで」等）は構造化しない。**
  1日単位の判定に効かないため `official_text_ja` にだけ書く
  （かつて `minutes_before_use` / `time_of_day` があったが計算に使われていなかった）。
  期限の表し方を分類する `mode` ラベルも持たない
  （`same_day_allowed` と `days_before_use` で判定できる）。

  **窓口・券売機だけで買う券には書かない。** 「当日その場で買う」以外の選択肢が
  無いため情報にならない（実データ81件のうち79件が未設定で、設定されていた2件は
  どちらもオンライン券だった）。**購入URLがあるchannelを参照する券には必須**。
  `same_day_allowed: false` の券は前売りなので `discount_reasons` に
  `advance_purchase` も必須（いずれもtaxonomyチェックで強制）
- `price`: 下記
- `requirements`: 購入手順 (`description_ja`) と持ち物 (`proof_ja`)。
  **証明書の種類を分類するラベルは持たない**（かつて `proof_types` 12ラベルがあったが、
  写真付き身分証明書と運転免許証を機械的に区別しても料金計算に効かず、
  実データでも文章に同じことが書かれていた）。公式表記のまま写す
- `stacking`: 他割引との併用可否。資料に無ければ `"unknown"`（推測しない）
- `source_refs`: 必須（確定料金でsource_refsが無いとcoverageチェックが落ちる）

## price（価格）

★**1つの offer は1つの金額を持つ。** 日付によって料金が変わるなら
**カレンダーごとに offer を分ける**（「大人1日券（平日）」「大人1日券（土日祝）」）。
かつて `date_table` で1つの offer に日付別の金額表を持たせられたが、
同じ事実を2通りで書けてしまい、日付マッチングが `calendar_ids` と `date_table` の行で
二重実装になっていた。料金表を組む処理でも「金額の読み方」が2通り必要になり、
実際に date_table 側を読み忘れて表から料金が欠落した。

**「どういう料金か」を表す分類フィールドも持たない。** かつて `price.mode`
（`fixed | free | derived_discount | live_dynamic | range | unknown`）
があったが、**どのフィールドを埋めたかで100%決まる**（実データ290件で例外なし）。
しかも「`mode: "free"` なのに `amount: 500`」のような**内部矛盾を書けてしまう**穴で、
それを取り締まる検査とfixtureまで存在していた。導出にすればその矛盾は書けない。

| 埋めるフィールド | 意味 |
| --- | --- |
| `amount`（非負整数、JPY） | 固定料金。**0 なら無料** |
| `base_offer_id` ＋ `discount` | 「通常料金から500円引」のような相対価格 |
| `live_lookup_required: true` | ダイナミックプライシング |
| `range` | 公式が「¥5,900〜」のような幅でしか公表しない場合 |
| （どれも無い＝`amount: null`） | 判読不能・記載なし |

- **`discount` に「金額か割合か」の判別子は持たない。**
  `discount.amount`（「1,000円引き」→ 1000）と
  `discount.percent`（「10%引き」→ 10）の別フィールドで、どちらか一方だけを設定する
  （判別子と値の食い違いを書けなくするため）。
  **割合の場合、端数処理が公式に書かれていなければ最終金額を自分で計算して
  固定料金にしてはいけない**（実際の請求額とずれる）
- **ダイナミックプライシングは金額を推測・固定化しない。**
  `amount: null`, `live_lookup_required: true`, `observed_at` を設定し、
  取得時点の観測値は `observed_amount` に入れる（確定料金ではない）
- **金額が確定できない場合は `notes_ja` に理由が必須。**
  かつて `mode: "unknown"` という明示的な宣言が「書き忘れ」と「判読不能」を
  区別していたので、その役目を理由の記述が引き継ぐ（taxonomyチェックで強制）

## party_rules（同行者構成ルール）

「大人1人につき未就学児2人無料」「親子セット」「ファミリーパック」
「団体料金」「日中券購入者向けナイター割引」「2人目以降割引」
など、**同行者構成で変わる料金**。個人向けofferだけで無理に表現しない。

`components` に役割ごとの人数条件（`min_count` / `max_count` /
`per_qualifying_count`）と `price_effect`（`free | fixed_total |
fixed_per_person | discount_amount | discount_percent`）を持たせる。

**この構造は実際に料金計算に使われる。**
`lookup-price.mjs --party "adult:2,elementary:2"` がパーティ構成に
party_rules を適用し、**個別購入の合計と比べて安い方**を返す
（例: 個別¥18,400 vs ファミリーパック¥14,000 → ファミリーパックを選ぶ）。
`per_qualifying_count` を超えた人数はルール外として個別料金で加算される
（「大人1人につき未就学児2人まで無料」で3人目は無料にならない）。

## fees（チケット外費用）

★**「返ってこない追加負担」だけを記録する。** ICカード発行手数料 / システム利用料 /
配送料など。**知りたいのは実質いくら払うかであって、内訳の分類ではない。**

除外するもの:

- ★**返金される保証金（ICカードデポジット等）は記録しない。** 返却すれば戻るので
  実質の負担ではない。返金の有無を表すフラグ (`refundable`) も持たない
  — 載っているものは全て負担、というだけにする
- ★**特定の状況でのみ発生する費用も記録しない**（再発行手数料＝紛失時、
  キャンセル料、変更手数料）。「普通に買ったらいくらか」に答えないため

どちらも taxonomyチェックが費用名から検出してエラーにする。

**券の提示価格に返金される保証金が含まれている場合**（「リフト1日券 6,500円
（IC保証金500円込）」）は、**offerの price を実質負担（¥6,000）で記録し**、
公式提示額と差し引いた金額を `price.notes_ja` に書く
（説明が無いとtaxonomyチェックが落ちる）。

`lookup-price.mjs` が出す数字は**1つだけ**:

```
実質負担 ＝ 券の合計 ＋ fees
```

かつて `refundable` / `included_in_offer_price` のフラグから「窓口で払う額」
「戻る額」「実質負担」の3つを出していたが、必要なのは実質負担だけだった。

## calculation_policy

税込・併用可否のデフォルト・最安購入のヒントなど、料金計算全体に関わる方針。

## data_quality

- `status`: **3段階だけ**
  - `complete`（そのまま使える）— 確認待ちが1件も無い場合だけ
  - `needs_review`（人間の確認が必要）— 判読不能・unknown・解釈の余地がある
  - `failed`（取得できなかった）— 料金を1件も記録できなかった

  かつて `partial` / `draft` もあったが、「使える」「確認が必要」「取れなかった」の
  3つに落ちるので分けても判断が変わらなかった。
  `human_review_required` が1件でもあれば `complete` にはできない（機械で強制）。
- ★**`human_review_required`: 人間が確認すべきこと。3点セットで書く**
  - `what_ja`: 何を確認してほしいか
  - `why_ja`: なぜ確定できなかったのか
  - `where_ja`: **どこを見れば確認できるか**（保存資料のパスとページ内の場所、
    または公式URL。「料金表」だけではどのページのどこか分からない）
  - `source_refs`: 根拠資料

  抽出担当の確信度ラベル（`confidence` / `reading_confidence`）を廃止して
  こちらに一本化した。「自信がない」という申告は人間を動かせないが、
  「page-001/page.html の料金表の『学生』行を見て、短大生が含まれるか確認してほしい」
  なら動ける。
- `unresolved_questions`: 資料から確定できなかった事項（推測の代わりにここへ）。
  ラベルを `unknown` にした場合もここに理由を記録する
- `illegible_items`: 判読不能箇所。関係するofferを `related_offer_ids` で紐づける。
  紐づいたofferに確定料金が入っているとcoverageチェックが落ちる
  （＝判読不能箇所を推測で埋めることを機械的に禁止する）
