# 抽出ルール（抽出担当・監査担当 共通の判断基準）

## 情報源の扱い

1. 情報源はユーザー指定URL（ホワイトリスト）と、そこから直接リンクされる
   公式資料（料金PDF / 料金表画像 / オンライン販売ページ / キャンペーンページ /
   利用規約 / 料金表示用の公式APIレスポンス）のみ。検索エンジンは使わない
2. 追加取得した資料は必ず `sources` に `user_specified: false` と
   `linked_from_source_id` 付きで記録する
3. 抽出は保存資料（`{resort}/sources/{season}/` 配下）を根拠にする。
   読む順序: `manifest.json` → `visible-text.txt` → `tables.md` →
   `screens/*.jpg`（全枚数）→ 必要に応じて `downloads/*.pdf` / `network/`。
   `page.html` は `visible-text.txt` の10倍以上のコストがかかるので、
   テキスト・表・画像のどこにも現れない情報が必要になったときだけ開く
4. 保存資料が対象シーズンのものかは `capture-sources.mjs` が自動判定し、
   `manifest.json` の `season_check` に記録する（主軸は「日付＋曜日」の照合。
   `12/26（金）` は年が変われば曜日も変わるため、2件以上あれば年が一意に決まる）。
   **`verdict` が `match` 以外なら抽出しない。** 判定は
   `mismatch`（前シーズンのまま）/ `conflicting`（ページ間で年が矛盾＝一部だけ
   更新済み）/ `undetermined`（手がかりなし）に分かれる。
   出力JSONの `season.source_refs` には判定の根拠となった資料IDを必ず入れる
   （必須。coverageチェックで強制）
5. シーズン券専用ページ・PDF・申込フォームは取得しない。通常券と同一ページに
   記載されている場合も、シーズン券の価格・条件・購入者特典・保有者限定割引は
   JSONへ転記しない

## 推測禁止の具体運用

| 資料に無い情報 | してはいけないこと | 正しい処理 |
| --- | --- | --- |
| 子供の年齢範囲 | 「小学生=6〜12歳」と補完 | `school_levels` のみ設定、年齢は null |
| シニアの下限年齢 | 「60歳以上」と仮定 | 年齢 null ＋ 未解決事項 |
| 未就学児無料の条件 | 「保護者同伴で無料」と仮定 | 資料の表記どおりに。同伴条件が無ければ書かない |
| 平日・休日の定義 | 標準カレンダーと**異なる**独自定義を見落とす | 基本は標準カレンダー準拠の `day_types`（weekday=月〜金の非祝日）でよい。公式が独自定義（「祝日は平日料金」等）をしている場合のみ `dates`/`excluded_dates` で上書きし公式表記をnotesへ |
| 年末年始の日付 | 「12/29〜1/3」と仮定 | 公式に日付があればdate_range、無ければcalendarを作らず未解決事項 |
| 年末年始の料金区分 | 「普通は休日料金」と仮定 | **公式に明記が無ければ未解決事項へ。** `weekday` は年末年始を飲み込むので、放置すると安すぎる料金を出す（taxonomyチェックが未定義を検出する） |
| 「大学生」の範囲 | 大学院生・短大・専門を含むと仮定 | 明記があるschool_levelsのみ（`graduate` 等）。不明なら `university` のみ＋未解決事項 |
| Web購入の期限 | 「期限なし」「前日まで」と仮定 | `purchase_deadline` に記載どおり記録。記載が無ければ mode `not_stated` |
| 共通券の利用範囲 | 「隣のスキー場でも使える」と仮定 | `shared_with_resorts` は公式記載のみ。対象スキー場が不明なら未解決事項 |
| Web価格 | 窓口価格から割引額を計算 | 公式に金額が無ければ `derived_discount` か `unknown` |
| 割引の併用可否 | 「併用不可が普通」と仮定 | `stacking: "unknown"` |
| 必要な証明書 | 「住所確認できるもの」と仮定 | `proof_types` は公式記載のみ。無ければ空 |
| 利用可能エリア | 「全山共通のはず」と仮定 | `area_ids` 空 ＋ 必要なら未解決事項 |
| 券の有効時間 | 「4時間券=4時間」以外の補完 | `validity` は公式記載のみ、無ければ `unknown` |
| ICカード費用 | 「500円デポジット」と仮定 | 記載が無ければ fees に入れない ＋ 未解決事項 |
| 動的価格の金額 | 取得時の表示額を固定料金化 | `live_dynamic` ＋ `amount: null` ＋ `observed_at` |

## ラベルに当てはまらないとき（unknown の使い方）

★**`other` というラベルは全群で廃止した。** ラベル体系は公式資料に出てくる概念を
網羅しているはずなので、当てはまらないものが出たら**ラベル体系が不足している**
ということである。勝手にラベルを追加せず `unknown` を使う。

`unknown` を使うときは必ず:

1. **`official_label_ja` に公式表記をそのまま写す** — 何を unknown にしたのかが
   人間に伝わらないと通知の意味がない（条件の場合は必須。無いとエラー）
2. **`description_ja` になぜ確定できなかったのかを書く**
3. 条件の場合は `unresolved: true` を付ける

`check-taxonomy.mjs` が `unknown` にした全項目を
「どのパスを・公式表記が何で」の形で集計して警告する。
**完了報告の「unknown にした項目」に必ず転記する**（ラベル追加の提案も添える）。

画像の文字が読めない場合も `unknown`（＋ `illegible_items` に記録）。

## 料金の読み取り

### 手順

1. **`visible-text.txt`** を読む。大半の料金・条件・注記はここにある
2. **`tables.md`** で表の金額を確定させる。`rowspan`/`colspan` は解決済みで
   1セル=1値のTSVになっているので、**行と列の対応を画像から読み直さない**

   ```
   券種	大人	子供
   9時間券	平日：6,300円 / 土日：6,800円	4,300円
   ```

   `innerText` は表を壊す。同じ表が `visible-text.txt` では
   「土日：6,800円」と「4,300円」が同じ行に見える（セル内改行のため）
3. **`screens/*.jpg` を全枚数見る。** これは省略できない
4. PDFがあれば **Readツールで直接読む**（変換不要）

### なぜタイル画像を全部見る必要があるのか

**画像内に書かれた料金は `visible-text.txt` に一切現れない。**
実例（めがひら）: バナー画像内の
「こどもデー 小学生以下 ¥1,000（入場料￥600込）」
「サンフレッチェ応援デー 大人¥5,000 子供¥1,000」
「ドラゴンフライズ応援デー ¥3,400」「雪マジ 19-22歳 リフト券0円」は
テキスト検索で**0件**。同じページの注記
「※入場料はゲレンデをご利用される3歳以上の方すべてに必要」も画像の外にあるが、
料金の前提条件として不可欠である。

**フルページの `screens/full.jpg` を料金の読み取りに使わない。**
縦が数千pxあり、モデルに渡すと長辺1568pxに縮小されて数字が判別できない
（実測 1280×7785px → 329×2000px）。タイル（1280×1400px）は縮小されない。

### 画像・PDFから読むときの注意

1. 表の**構造**を先に確定する: 行見出し（券種? 対象者?）、列見出し
  （日付区分? 購入経路?）、セル結合、注釈記号（※, *1）
2. **小さい文字の条件を読み落とさない。** 実例（紋別市営大山スキー場の
   料金PDF）: 「ファミリー割引10%」の近くに小さく
   **「割引はシーズン券のみになります」** と書かれており、これを読み落とすと
   **対象外の割引を通常券の割引として記録してしまう**
3. 画像料金表は元画像・取得元URL・読み取り結果・確信度
   （`reading_confidence`）・判読できない箇所を記録する。判読できない数字を
   隣接料金・過去料金から推測しない（`unknown` ＋ `illegible_items`）
4. 行と列の取り違え防止のため、抽出後に「1セル=1金額」の対応を最低2箇所、
   画像上の位置で再確認する
5. 10ページを超えるPDFは `pages` を分けて読む

### 表の外にある条件

注釈は本体と同じofferに反映する（「※シニアは65歳以上」の見落としが
典型的な監査指摘）。**`tables.md` には表の外の注釈が入らない**ので、
料金区分の定義・年齢条件・除外日・但し書きは `visible-text.txt` と
`screens/*.jpg` で表の前後を確認する。

## 券の有効範囲（validity）の判断

- **`validity` は「リフトを使える範囲」を表す。パッケージの提供単位ではない。**
  「1日セット（リフト4時間券付き）」→ `hours_from_first_use: 4`
- **1日券は `calendar_day` ＋ `days: 1`。** 「当日有効」しか書かれていなければ
  `days: 1`、本当に不明なら `mode: "unknown"`（推測しない）
- **25時間券のように複数日へ分けて使える券は `hours_pool`。**
  `hours_from_first_use` にすると「初回利用から連続25時間」の意味になり、
  1日券や「9時間以上」の候補として誤って選ばれる
- 分割可能な複数日券は `usable_within` に有効範囲を記録する
  （「シーズン中」と「購入から30日以内」は別物）
- **`covers_hours_types` にその券が使える営業区分を記録する。**
  ナイター込み1日券は `["regular","night"]`、ナイター券は `["night"]`。
  **資料に記載が無ければ `null`。`false` と決めつけない**
- ナイター料金の記載が無い場合は `unresolved_questions` に記録する。
  「通常券でナイターも滑れる」と推測しない

## 営業時間の抽出（operating_hours）

料金ページとは別に、営業時間・営業カレンダーのページを必ず確認する
（`source-urls.json` に登録されているのはそのため）。抽出するのは:

1. **営業期間**（`season.start_date` / `end_date`）
2. **通常営業の時間帯** — リフト別に書かれている場合はリフト単位で記録し、
   滑走可能な時間帯は運行するリフトの和集合で決める
3. **ナイター営業** — 対象日を `calendars` の `dates` に列挙する
   （「毎週土曜」なら `day_types: ["saturday"]`）。**ナイター時に運休する
   リフトを `operating: false` で明記する**
4. **定休日** — `hours_type: "closed"` の `operating_hours` として記録する。
   「毎週火曜定休（12/30は営業）」は `day_types: ["tuesday"]` ＋
   `excluded_dates: ["2025-12-30"]`

**営業していない日に料金を出さないために必要な情報である。** 定休日を落とすと、
休業日に料金を提示してしまう。

営業時間の記載が資料に無い場合は推測せず `unresolved_questions` へ記録する。
ただしその場合、**1日券が何時間滑れるかが確定しない**ことを明記する。

## 条件（eligibility_conditions）の書き方

**他のセクションで表せるものは条件にしない**（同じことを2箇所に書かせない）:

| 表したいこと | 書く場所 |
| --- | --- |
| 年齢・学校区分 | `audiences`（`age_min` / `age_max` / `school_levels`） |
| 対象日 | `calendars` |
| 利用時間帯 | `products.validity`（`fixed_time_window`） |
| 購入期限 | `offers.purchase_deadline` |
| 人数で料金が変わるもの | `party_rules` |

条件に使えるのは9種類（`gender` / `area_relationship` / `proof_required` /
`companion` / `membership` / `payment_method` / `prior_purchase` /
`unknown`）。上表の概念を条件に書くと**どこに書くべきかを案内するエラー**になる。

証明書（`proof_types`）は**公式に書かれているものだけ**を記録する。
「住所を確認できるもの」としか書かれていなければ `address_proof` のままにし、
運転免許証・保険証などに具体化してはいけない。
「証明書不要」は**明記されている場合のみ** `none_required` を使う
（書いていない＝不要、と解釈しない）。

## ラベル付けの規則

**ラベルを選ぶ前に `taxonomy.json` の該当ラベルの定義**（`definition_ja` /
`applies_to` / `excludes_ja` / `decision_rule_ja`）**を読むこと。** 以下は要点の再掲。

★**`discount_reasons` は `applies_to` で「誰に適用できるか」を宣言している。**
`qualified_only`（会員・宿泊者・地域住民・クーポン等）の割引には
**必ず `eligibility_conditions` で資格の条件を書く。** 書き忘れると
「誰でも使える割引」として扱われ、資格の無い人に安い金額を提示してしまう。
`party_composition`（家族割・団体割）は `party_rules` に人数条件を構造化する。

- 学生であることは `audiences.school_levels` で表す
  （`discount_reasons` に student というラベルは無い）
- Web割引・オンライン割引・ネット割はすべて `online_purchase`
- **当日購入可か、期限があるかで分類を分ける**:
  - 当日でも買えるWeb券 → `online_purchase` のみ
    （`purchase_deadline.mode: "same_day_allowed"`）
  - 前日以前の購入期限があるWeb券（前売り）→ `online_purchase` ＋
    `advance_purchase`（`purchase_deadline.mode: "relative"` で
    `days_before_use` を記録。「前日23:59まで」= days 1 + time_of_day）
  - 当日内の期限（「利用15分前まで」等）→ `online_purchase` のみ＋
    `purchase_deadline.mode: "relative"` で `minutes_before_use` を記録
  - `online_purchase` のofferでは `purchase_deadline` を省略しない。
    資料に期限の記載が無ければ `mode: "not_stated"` を明示する
    （「期限がない」と推測して `same_day_allowed` にしない）
- 道民割・県民割・市民割・町民割はすべて `local_resident` ＋ `area_relationship`
  条件（`relationships`, `area_ids`）で構造化する。notes_jaに書くだけでは検証が落ちる。
  **`local_worker` / `local_student` というラベルは無い**（表記揺れとして拒否される）。
  在勤だけ・在学だけが対象の場合も `local_resident` を使い、
  `relationships: ["employed"]` / `["enrolled"]` で区別する
- 居住（resident）・在勤（employed）・在学（enrolled）を区別する。
  「〇〇市にお住まい・お勤め・通学の方」→ relationships に3つ並べ、`match: "any"`
- **早割も `advance_purchase` に含める**（`early_bird` というラベルは無い）。
  「いつまでに買う必要があるか」はラベルではなく構造で表す:
  利用日基準の期限 → `purchase_deadline`、販売期間の締切 → `sales_period`。
  販売期間が終了した割引は照会結果に出ない（`lookup-price.mjs` が除外する）
- 「地元の方」など対象地域が公式に特定できない場合は area を推測せず
  `unknown` 条件＋未解決事項
- **レディースデー・メンズデー・シニアデー・こどもデー等に専用ラベルは無い。**
  すべて `special_day` ＋ 対象者条件で表す（専用ラベルは無限に増えるため）:
  - 対象日 → `calendars`（必須）
  - 性別の限定 → `eligibility_conditions`（`type: "gender"`, `genders: ["female"]`）
  - 年齢・学校区分の限定 → `audience_ids`
- 特定日の子供料金は通常の子供料金と**別offer**にし、calendarで日付を限定する
- **`special_day` は対象日の明示が必須。** `day_type: "special"` 単独では
  日付に一致しないので `dates` / `date_ranges` / 曜日（`day_types`）を持つ
  calendarを紐づける
- **家族割（`family`）・団体割（`group`）で人数条件により料金が決まる場合は
  `party_rules` に構造化する。** discount_reasons だけでは料金を算出できない。
  `lookup-price.mjs --party "adult:2,elementary:2"` が party_rules を適用して
  合計を計算し、個別購入の合計と比べて安い方を出す
- 保証金（返金あり）と発行手数料（返金なし）を混同しない。どちらも fees へ
- **券の分類は `validity` だけで表す**（`product_type` というフィールドは無い）。
  セット券・共通券・ナイター・エリア限定は専用フィールドが担う
  （1つのラベルに押し込むと「1日券である」情報が失われ、1日券の検索から漏れる）:
  - 昼食付き・温泉付き → `offer_type: "package"` ＋ product の `included_items`。
    `validity` は利用単位のまま（ランチ付き1日券なら `calendar_day` / `days: 1`）
  - 複数スキー場の共通券 → `shared_with_resorts` で相手スキー場を明記し、
    **関係する全スキー場のJSONに同じ共通券を記載する**（片方だけに書かない）
  - ナイター券 → `validity` を `fixed_time_window`（17:00〜21:00等）で表す。
    **`covers_hours_types` は設定しない**（時間帯から判定できるため）
  - ナイター込み1日券 → `covers_hours_types: ["regular","night"]`。
    **`covers_hours_types` は1日券・複数日券にのみ設定する**
    （時間券に付けると validity と二重になり矛盾しうる）
  - 初心者エリア限定 → `area_ids`
  - 観光用ゴンドラ券・歩行者用乗車券 → **収集対象外**（記録しない）。
    滑走できない券はこのデータの用途外
- 「半日券」は所要時間で `hours_from_first_use` か `fixed_time_window` にする
  （「半日」は時間数が確定しないため専用ラベルを作らない）
- 共通券であってもシーズン券は対象外。利用日数が明示された日券・複数日券だけを
  `shared_pass` として記録する

## 監査チェックリスト（Stage 2）

機械検証（3スクリプト）が通っていることを前提に、人間的な照合を行う:

- [ ] 表の金額が `tables.md` の値と一致する（行列の取り違えはTSV化で構造的に
      防いでいるので目視は不要）
- [ ] **`screens/*.jpg` を全枚数見て、画像内の料金が草案に反映されている**
      （テキスト検索では検出できないので、ここが最も落ちやすい）
- [ ] 画像・PDF由来の料金表で行と列を取り違えていない
- [ ] PDFの小さい文字の条件を読み落としていない
      （「割引はシーズン券のみ」のような対象範囲の限定）
- [ ] 表の外にある注釈（※印・脚注・前後の但し書き）を見落としていない
- [ ] PDFの別ページに条件（対象期間・除外日・注意事項）がないか
- [ ] HTMLテキスト抽出で欠落した情報がないか（タブ・アコーディオン内など）
- [ ] 金額・年齢・日付・販売経路が証拠と一致する（無作為に5件以上を再照合）
- [ ] すべての確定情報に source_refs がある
- [ ] 未登録ラベル・類義ラベルの表記揺れがない
- [ ] 公式名称（official_label_ja）と標準ラベルを混同していない
- [ ] Web割引が `online_purchase` へ統一されている
- [ ] 事前購入が `advance_purchase` として分離されている
- [ ] 県民割・市民割が geographic_areas ＋ area_relationship で構造化されている
- [ ] 居住・在勤・在学が区別されている
- [ ] レディースデーに日付条件と対象者条件がある
- [ ] 子供デーが通常子供料金と区別されている
- [ ] `unknown` にした項目に公式表記（`official_label_ja`）と理由が記録され、
      完了報告に転記されている（`other` というラベルは全群で廃止）
- [ ] 保証金と手数料を混同していない
- [ ] 動的価格を固定価格として保存していない
- [ ] 営業時間・ナイター営業日・定休日が `operating_hours` に構造化されている
      （`season.notes_ja` の散文で済ませていない）
- [ ] 定休日が `hours_type: "closed"` として記録され、例外営業日が
      `excluded_dates` に入っている
- [ ] 基準となる人物区分に `is_default: true` が付いている（「大人」など）
- [ ] `school_levels` の列挙は「上が学校区分で閉じている」場合のみ
      （「中学生以上」「高校生以上」は社会人を含むので列挙せず `is_default` で表す）
- [ ] 年齢が学校区分から推測されていない（公式表記に数値がある場合のみ age を入れる）
- [ ] 短大生・専門学校生・高専生などが公式表記にある場合、ラベルを追加せず
      `human_review_required` に記録して人間へ通知している
- [ ] 対象シーズン外の料金が混入していない
- [ ] `manifest.json` の `season_check.verdict` が `match` である
      （`accepted_by_human` で通している場合は、その判断が妥当か確認する）
- [ ] `season.source_refs` が実際にシーズンを示している資料を指している
- [ ] シーズン券、購入者特典、保有者限定割引が混入していない
- [ ] オンライン券の購入期限（当日可 / 前日以前 / 記載なし）が
      `purchase_deadline` に記録され、期限付きは `advance_purchase` になっている
- [ ] 「大学生」「学生」の範囲（大学院生・短大・専門を含むか）を
      資料の明記どおりに `school_levels` へ反映している
- [ ] 共通券に `shared_with_resorts` があり、相手スキー場のJSONにも
      同じ共通券が記載されている（未作成なら human_review_required に記録）
- [ ] 昼食・温泉等のセット内容が `included_items` に構造化されている
- [ ] 平日・休日のcalendarが標準カレンダー準拠でよいか（公式の独自定義が
      ないか）を確認し、年末年始・特定日は公式の明示日付になっている
- [ ] `lookup-price.mjs` で平日・祝日・年末年始・特定日の料金が
      実際に引けることを確認した
