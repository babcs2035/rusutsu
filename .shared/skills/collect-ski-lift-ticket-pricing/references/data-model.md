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
  "geographic_areas": [],
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
居住・在勤・在学の違い / 学生割・宿泊者割・会員割・障害者割 /
幼児無料・親子券・ファミリーパック / ICカード保証金・発行手数料 /
グループ全体での最安購入方法 / どこで・いつまでに購入する必要があるか。

## sources（保存資料）

capture-sources が保存した証拠へのポインタ。料金計算に影響する全データは
`source_refs` でここの `id` を参照する。

- `type`: `html | pdf | image | api_response | screenshot | text | other`
- `path`: 保存資料への相対パス（例: `page-001/page.html`）。
  画像・PDF根拠の場合は必須（coverageチェックで強制）
- `user_specified`: ユーザー指定URLなら true。追加取得資料は false とし、
  `linked_from_source_id` でリンク元を記録する
- `reading_confidence`: 画像・PDFの読み取り確信度（`confidence_levels`）

## geographic_areas（地理領域）

国割・道民割・県民割・市民割・町民割の対象地域を定義する。
`level` は `country | prefecture | subprefecture | municipality | district |
region_group | other`。`parent_id` / `member_area_ids` で包含関係を表せる。

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
  地域条件は offer の `eligibility_conditions` で表現する
- 年齢区分が意図的に重複する場合（例: 「60歳以上」と「70歳以上」が併存）は`allow_age_overlap: true` を付ける

## calendars（適用日）

平日 / 休日 / 年末年始 / 特定日などの日付集合。
`day_types`（曜日・祝日等）・`dates`（明示日）・`date_ranges`（期間）・
`excluded_dates`（除外日）の組み合わせで表す。
具体的な書き方は `examples.md` の「カレンダーの指定方法」を参照。

かつて `calendar_type` という分類フィールドがあったが、中身から導出でき、しかも
実データで**構造が同一なのに別ラベルが付く**（`day_types:["special"], dates:3` が
`special_day` と `date_list` の両方で使われていた）など恣意的だったため廃止した。

**目的は「ユーザーが日付を入力したら料金が引ける」こと。**
`scripts/lookup-price.mjs --date YYYY-MM-DD` が以下の規則で日付を解決する:

- **平日・休日は標準カレンダー準拠がデフォルト**:
  `day_type: "weekday"` = 月〜金かつ祝日でない日、
  `saturday` / `sunday` / `public_holiday` = 標準カレンダーどおり
  （祝日は `scripts/jp-holidays.mjs` が振替休日・国民の休日込みで計算する）。
  公式資料が独自の定義をしている場合のみ、`dates` / `date_ranges` /
  `excluded_dates` の明示指定で上書きし、`notes_ja` に公式表記を写す
- ★**最重要の落とし穴: `weekday` は年末年始を飲み込む。**
  `weekday` は「月〜金かつ祝日でない日」なので 12/29(月) や 1/2(金) にも一致する。
  **多くのスキー場で年末年始は休日料金なので、年末年始を別カレンダーで定義しないと
  安すぎる料金を提示する。** 公式に期間が書かれていれば
  `year_end_new_year` ＋ `date_ranges` のカレンダーを作る（優先度により平日より
  優先される）。記載が無ければ `unresolved_questions` に記録する
  （taxonomyチェックが未定義を検出してエラーにする）
- **年末年始は必ず公式指定の日付**: `day_type: "year_end_new_year"` は
  単独では日付に一致しない。公式資料の期間を `date_ranges` で明示する。
  **期間はスキー場ごとに違うため「12/29〜1/3」のような一般的な期間を推測しない**
- **特定日（レディースデー等）も明示日付**: `dates` に列挙する
- **優先度**: `dates`（明示日）＞ `date_ranges` ＞ `day_types`。
  例: 1/1（祝日）は「年末年始」の `date_ranges` が「土日祝」の `day_type`
  より優先されるので、年末年始料金が正しく引かれる
- `excluded_dates` に含まれる日は常に不一致

## operating_hours（営業時間・ナイター・定休日）

**「その日の営業時間・ナイターの有無」の答えであり、同時に「1日券が何時間
滑れるか」の算出元でもある。**

日付条件は `calendar_ids` で `calendars` を参照する（仕組みを増やさない）。

- `hours_type`: `regular`（通常営業）/ `night`（ナイター）/ `closed`（定休日・休業）
  / `early_morning` / `special` / `unknown`
- `start_time` / `end_time`: **滑走可能な時間帯**。`closed` の場合は null
- `lifts[]`: リフト別の運行時間。`operating: false` で「ナイター時は運休」を表す。
  全体の営業時間しか公表されていない場合は空でよい

**定休日には料金を提示しない。** `hours_type: "closed"` は他の営業時間より優先する。
「毎週火曜定休（12/30は営業）」は
`day_types: ["tuesday"]` ＋ `excluded_dates: ["2025-12-30"]` で表す
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

**`hours_from_first_use` と `hours_pool` の区別が重要。** 25時間券を
`hours_from_first_use: 25` と書くと「初回利用から連続25時間滑れる券」の意味になり、
**1日券や「9時間以上」の候補として誤って選ばれる**。24時間以上を
`hours_from_first_use` にしているとtaxonomyチェックがエラーにする。

`usable_within` は分割可能な券の有効範囲。「シーズン中の任意5日」と
「購入から30日以内の任意3日」は別物なので区別する:

```json
{ "mode": "selectable_days", "days": 5, "usable_within": { "type": "season" } }
{ "mode": "selectable_days", "days": 3,
  "usable_within": { "type": "days_from_purchase", "value": 30 } }
```

### covers_hours_types — 1日券にナイターが含まれるか

**1日券・複数日券にのみ設定する。** 1日券は券自体に時間が書かれていないため
「ナイターを含むか」を `validity` から導出できない。時間券
（`hours_from_first_use` / `fixed_time_window`）は validity の時間帯・時間数から
判定できるので**設定しない**（設定すると二重管理になり矛盾しうる。
taxonomyチェックがエラーにする）。

```json
"covers_hours_types": ["regular"]           // ナイターなし1日券
"covers_hours_types": ["regular", "night"]  // ナイター込み1日券
"covers_hours_types": ["night"]             // ナイター券
"covers_hours_types": null                  // 資料に記載なし（推測しない）
```

**これは導出できない事実なのでフィールドとして持つ**（時間帯固定・付帯品・
事前購入は既存データから導出できるので持たせていない）。`null` を許すのが重要で、
「1日券にナイターが含まれるか書いていない」サイトを `false` と決めつけない。

「1日券（ナイターあり）」の解決順:
1. `covers_hours_types` に `regular` と `night` を両方含む1日券
2. 無ければ **1日券 ＋ ナイター券の合算**（内訳を出す）
3. ナイター券の料金が資料に無ければ**その旨を明示**して代替案を出す

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
| ナイターに使えるか | `covers_hours_types`（**1日券・複数日券のみ**） |
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
  （`type` は taxonomy の `included_item_types`: `lunch / meal_voucher /
  onsen / spa / rental / lesson` 等）。`offer_type: "package"` のofferが
  参照するproductには `included_items` が必須（taxonomyチェックで強制）
- **`shared_with_resorts`（共通券）**: 複数スキー場の共通券は
  どのスキー場と共通かを `shared_with_resorts`（`resort_id` / `name_ja`）に
  必ず明記する（公式名称が「共通」を示しているのに無ければtaxonomyチェックが落ちる）。
  **`validity` は利用単位のまま**（共通1日券なら `calendar_day` / `days: 1`）。**相手スキー場側のJSONにも同じ共通券を
  記載する**こと（1スキー場×1シーズン×1JSONの原則のため、共通券は関係する
  全スキー場のJSONに現れる）。相手側JSONが未作成なら
  `human_review_required` に記録する

## channels（購入経路）

窓口 / 自動券売機 / オンライン / アプリ / コンビニ / 旅行代理店 / ホテル
フロントなど。オンラインchannelには可能な限り `url` を入れる
（Web料金の購入先が分からないJSONにしない）。購入期限がchannel側に
書かれている場合は `purchase_deadline_ja` に公式表記のまま記録する。

## offers（料金オファー）

1件のofferは「**誰が＋どの券を＋いつ使うか＋どこで買うか＋どの追加条件を
満たすか＋いくらか**」を表す。

- `official_label_ja`: 公式サイト上の名称（例: 「WEB前売スペシャル」）
- `offer_type`: `standard | discounted | free | package | dynamic`
- `discount_reasons`: taxonomyのラベルのみ。複数条件は配列で表し、
  複合ラベルを新設しない（WEB前売 → `["online_purchase", "advance_purchase"]`）。

  ★**各ラベルは `applies_to` で「誰に適用できるか」を宣言している。**
  これが料金の出し方を決める:

  | `applies_to` | 意味 | 料金照会での扱い | 該当ラベル |
  | --- | --- | --- | --- |
  | `everyone` | 誰でも利用できる | **最安なら代表として提示してよい** | `online_purchase` / `advance_purchase` / `special_day` |
  | `party_composition` | パーティ構成から自動判定 | **人数・年齢構成が合えば適用して合計を計算**（`party_rules`） | `family` / `group` |
  | `qualified_only` | 条件を満たす人だけ | **代表にしない。**「〜なら¥X」として別掲、または条件を確認してから出す | `local_resident` / `membership` / `hotel_guest` / `coupon` / `disability` / `app_registration` / `payment_method` / `prior_purchase` / `unknown` |

  会員でも宿泊者でも地域住民でもない人に会員割引・宿泊者割引・地域割引を代表として
  出すと**誤った金額**になる。一方でファミリーパックは、パーティ構成が入力されて
  いるなら**自動的に計算すべき**もので、「資格を取得しないと使えない割引」とは
  性質が違う。この3つを混ぜないために `applies_to` を持つ。

  `qualified_only` の理由には **`eligibility_conditions` が必須**
  （taxonomyチェックが強制）。条件を書き忘れると「誰でも使える割引」として扱われる
  （実際にその穴があり、会員割引を条件なしで書くと代表として選ばれていた）。
- `audience_ids` / `calendar_ids` / `channel_ids` / `product_id`: 参照で表現
- `eligibility_conditions`: 地域条件・性別・証明書・同伴条件などの構造化条件。
  **他のセクションで表せるものは条件にしない**（年齢・学校区分→`audiences`、
  対象日→`calendars`、利用時間帯→`products.validity`、
  購入期限→`purchase_deadline`）。各条件は type ごとに専用フィールドで値を持つ
  （gender→`genders` / area_relationship→`relationships`+`area_ids` /
  proof_required→`proof_types`）。汎用の `operator` + `value` は
  実データで0件・型制約なしの穴だったため廃止した
- `sales_period` / `use_period`: 販売期間と利用期間を分離する
- `purchase_deadline`: **いつまでに買う必要があるか**の構造化。`mode` は
  - `same_day_allowed`: 当日購入可と明記されている
  - `relative`: 利用日からの相対期限（`days_before_use: 1` = 前日まで、
    `minutes_before_use: 15` = 利用15分前まで。`time_of_day` 併用可）
  - `absolute`: 固定の期限日（`date`）
  - `not_stated`: 資料に期限の記載がない（「期限なし」と推測しない）
  - `unknown`: 記載はあるが判読・解釈できない

  公式表記は `official_text_ja` に写す。**オンライン購入
  （`online_purchase`）のofferには必須**（当日可か・期限があるか・記載が
  ないかを必ず明示する）。**前日以前の期限（relative days>=1 / absolute）が
  ある券は前売りなので `advance_purchase` も必須**。当日購入可のWeb券は
  `online_purchase` 単独（いずれもtaxonomyチェックで強制）
- `price`: 下記
- `requirements`: 購入手順・持ち物など（証明書は `proof_types` で分類）
- `stacking`: 他割引との併用可否。資料に無ければ `"unknown"`（推測しない）
- `confidence`: 抽出確信度
- `source_refs`: 必須（確定料金でsource_refsが無いとcoverageチェックが落ちる）

## price（価格）

`mode` は `fixed | free | date_table | derived_discount | live_dynamic |
range | unknown`。

- `fixed`: `amount`（非負整数、JPY）必須
- `free`: `amount: 0` 必須
- `date_table`: 日付・calendarごとの金額表。行ごとに `source_refs` を付けられる
- `derived_discount`: 「通常料金から500円引」のような相対価格。
  `base_offer_id` と `discount {type: amount|percent, value}` 必須
- `live_dynamic`: ダイナミックプライシング。金額を推測・固定化せず
  `amount: null`, `live_lookup_required: true`, `observed_at` を設定する。
  取得時点の観測値は `observed_amount` に入れてよい（確定料金ではない）
- `range`: 公式が「¥5,900〜」のような幅でしか公表しない場合
- `unknown`: 判読不能・記載なし

## party_rules（同行者構成ルール）

「大人1人につき未就学児2人無料」「親子セット」「ファミリーパック」
「団体料金」「介護者割引」「日中券購入者向けナイター割引」「2人目以降割引」
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

ICカード保証金 / ICカード発行手数料 / 再発行料金 / システム利用料 / 配送料 /
その他必須手数料。**チケット料金と分離**し、offerに混ぜない。
`refundable` で返金される保証金と返金されない手数料を区別する
（資料に無ければ `null` ＋ 未解決事項）。

## calculation_policy

税込・併用可否のデフォルト・最安購入のヒントなど、料金計算全体に関わる方針。

## data_quality

- `status`: `complete | partial | needs_review | draft | failed`
- `unresolved_questions`: 資料から確定できなかった事項（推測の代わりにここへ）。
  ラベルを `unknown` にした場合もここに理由を記録する
  （`other` というラベルは全群で廃止した）
- `illegible_items`: 判読不能箇所。関係するofferを `related_offer_ids` で紐づける。
  紐づいたofferに確定料金が入っているとcoverageチェックが落ちる
  （＝判読不能箇所を推測で埋めることを機械的に禁止する）
- `human_review_required`: 人間による確認が必要な項目
