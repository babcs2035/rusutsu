# 特徴キー一覧（lift-ticket-features.mjs）

`scripts/lift-ticket-features.mjs` の `extractFeatures(data)` が返す特徴キーの一覧。実在施設も架空スキー場も同じ関数で抽出する。
キーは `分野:名前` または `分野:名前=値`。`=値` を持つキーは値ごとに別の特徴として数える（`product:validity.mode=hours_from_first_use` と `=fixed_time_window` は別）。
架空ケースの足し方・照合は `references/fictional-fixtures.md`、警告の考え方は `docs/plans/lift-ticket-duration-test-cases.md` の Y。

## 読み方の約束

- 自由記述（`notes_ja`）は読まない。構造化されたフィールド（enum・数値・配列の有無）から取る。
- 文言を正規表現で読む特徴（証明の種類・資格の種類・レンタルのサイズ・相対表記・レディース/こどもの日の名称）は **「上限として読む」**。
  該当語があれば出す＝過検出はあり得る。過検出の結果は「架空ケースが1件要る」という警告が増えるだけで、見落としにはならない。
  語は狭く保ち、広い語（「予約」「購入」「カード」だけなど）は使わない。語を足したら実データで過検出を確認する。
- 金額の組み合わせで決まる特徴は、offers の最安価格を比べて判定する（基準区分・標準料金＝割引理由なし・資格条件なし）。
- 実在施設に新しい特徴が出たら、架空ケースを足すか `coverage-acknowledged.json` に理由付きで載せる。

## 券の種類（product / window）

| キー | 意味 |
|---|---|
| `product:day_pass=present` / `absent` | 利用単位が calendar_day の券があるか |
| `product:day_pass.no_offer_for_default_audience` | 1日券はあるが、基準区分（大人）向けの offer が無い（特別日券だけ等） |
| `product:no_day_pass.hours_pass_present` / `.no_hours_pass` | 1日券が無く、時間券がある／無い |
| `product:validity.mode=<mode>` | 利用単位（calendar_day, consecutive_days, selectable_days, hours_from_first_use, hours_pool, fixed_time_window, points, rides, unknown） |
| `product:hours_pass.hours_ge9` | 9時間以上の時間券 |
| `product:usable_within_stated` | usable_within_ja（いつまでに使い切るか）が書かれている |
| `product:covers=<時間帯+...>` / `=unspecified` | covers_hours_types（regular・night・early_morning をソートして `+` で連結）。未指定は `unspecified` |
| `product:area_limited` / `product:shared_with_resorts` / `product:add_on` | エリア限定／共通券／追加券 |
| `product:included=<type>` | 付いている物（meal, bath, rental, lesson, voucher, unknown など） |
| `window:kind=<種類>` | 時間帯固定券の種類: `morning` / `afternoon` / `night` / `early_morning` / `day_and_night`（午後＆ナイター）/ `afternoon_into_night`（17:30以降まで・ナイター途中まで）/ `other` / `untimed`（時刻なし） |
| `window:relative_label` | 名称・公式表記に「オープン〜」「〜クローズ」「営業終了まで」等の相対表記（上限として読む） |
| `window:one_side_open` | 開始か終了の片方が null |

## 営業時間（hours / calendar）

| キー | 意味 |
|---|---|
| `hours:empty` / `hours:all_unknown` | operating_hours が空／すべて unknown |
| `hours:type=<type>` | 使われている hours_type（regular, night, early_morning, closed, unknown） |
| `hours:regular.time_missing` | regular なのに start/end が欠けている（推定・不明の表し方） |
| `hours:regular.varies_by_day_type` / `.varies_by_period` | regular が複数あり、曜日で変わる／期間・日付で変わる |
| `hours:regular.multiple_time_ranges` | regular の時刻が2種類以上 |
| `hours:regular.length_lt8` / `.length_ge9` | 通常営業が8時間未満／9時間以上 |
| `hours:<regular\|night\|early_morning>.day_type_limited` / `.date_limited` / `.period_limited` / `.has_exception` | その営業時間の calendar が、曜日限定／日付限定／期間指定／除外日あり |
| `hours:closed.weekly` / `.dates` / `.has_exception` | 定休日（曜日）／休業（日付・期間）／定休日の例外 |
| `hours:night_without_regular_times` | ナイターはあるが通常営業の時刻が無い |
| `hours:break_between_regular_and_night` / `hours:regular_night_contiguous` | 通常終了〜ナイター開始に休止がある／連続している |
| `hours:early_morning_with_covering_product` | 早朝営業と、早朝を含む券の両方がある |
| `hours:lift_suspended` / `hours:per_lift_times` | リフト別 operating=false（ナイター時の一部運休）／リフト別の時刻がある |
| `calendar:day_type=weekday` / `=weekend_holiday` | calendar が平日／休日・土日の区分を使う |
| `calendar:included_dates` / `calendar:excluded` | 個別日付の指定／除外日・除外期間 |

## 料金の条件（offer / channel）

| キー | 意味 |
|---|---|
| `offer:reason=<理由>` / `offer:reason=none` / `offer:reason.multiple` | discount_reasons の値ごと（online_purchase, advance_purchase, special_day, family, group, local_resident, membership, hotel_guest, coupon, app_registration, payment_method, prior_purchase, unknown）／標準料金（理由なし）／理由が2つ以上 |
| `offer:channel_specified` | 販売経路の指定がある |
| `offer:sales_period=start_end` / `start_only` / `end_only` / `text_only` | 販売期間の書き方（text_only は日付なしで文言だけ） |
| `offer:use_period` | 利用可能期間の指定 |
| `offer:deadline=same_day_ok` / `advance_only` / `unstated` / `days_before` / `fixed_date` | 購入期限の書き方 |
| `offer:proof=<種類>` | 必要な証明（上限として読む）: `qr_screen`, `photo_id`, `student_card`, `address_proof`, `disability_certificate`, `membership_card`, `coupon_voucher`, `lodging_proof`, `reservation_proof` |
| `offer:qualification` / `offer:qualification=<種類>` / `offer:qualification.nominal_age` | target_qualification の有無と種類（上限として読む）: `lodging_guest`, `resident`, `member_holder`, `student`, `coupon_presenter`, `app_registration`, `foreign_resident`, `birthday_or_age`。nominal_age の有無 |
| `offer:gender_limited` | target_genders がある |
| `offer:price.live_lookup_required` / `offer:price.amount_null` | 変動価格／金額が null |
| `offer:stacking=<mode>` | 併用可否（stackable, not_stackable, unknown） |
| `offer:ladies_day_name` / `offer:childrens_day_name` | 名称にレディース／こどもの日（上限として読む） |
| `channel:has_url` / `channel:has_location` / `channel:deadline_stated` | 経路にURL／場所／購入期限の文言がある |

## 人物区分（audience）

| キー | 意味 |
|---|---|
| `audience:split=school` / `=age` / `=school_and_age` | 学校だけ／年齢だけ／学校と年齢の両方で区分 |
| `audience:school_set=<学校+...>` | school_levels の組（ソートして `+` 連結。例 `junior_high_school`、`high_school+university`） |
| `audience:age_crosses_school=<学校>` | 年齢区分が学校の年齢範囲（未就学0-6・小7-12・中13-15・高16-18）を部分的にまたぐ |
| `audience:child_by_age_only` / `audience:senior_by_age` | 年齢だけの子ども区分（〜15歳）／55歳以上のシニア |
| `audience:default_has_age_max` / `audience:default_has_age_min` | 基準区分（大人）に年齢の上限／下限がある |
| `audience:student` / `audience:young_named` / `audience:senior_named` / `audience:disability` | 大学生等／ヤング名称／シニア名称／障がい者 |
| `audience:allow_age_overlap` / `audience:age_basis_stated` / `audience:has_base_audience` | 年齢重複を許す／基準日の記載／base_audience_id |
| `audience:rental_audiences_present` | レンタル専用区分がある |

## 同行者ルール（party）

| キー | 意味 |
|---|---|
| `party:rule` | party_rules がある |
| `party:effect=<type>` / `party:effect=regular_price` | 構成員の price_effect（free, fixed_total, fixed_per_person, discount_amount, discount_percent, unknown）／効果なし＝通常料金 |
| `party:per_qualifying_count` | 大人N名につきM名 |
| `party:component.offer_ids` / `party:component.product_ids` | offer／特定の券を参照する構成員 |
| `party:count=unbounded` / `fixed` / `range` | 人数の上限なし／固定／幅あり |
| `party:components=1` / `2` / `3` / `4plus` | 構成員の役割数 |
| `party:channel_limited` / `party:sales_period` / `party:use_period` / `party:calendar_limited` / `party:qualification` / `party:gender_limited` | 経路・販売期間・利用期間・曜日日付・資格・性別の限定 |
| `party:exclusive_group` | exclusive_group_id（1グループ1つまで） |
| `party:multi_day_product` / `party:day_pass_product` / `party:timed_product` | 対象の券が複数日券／1日券／時間券・時間帯券 |
| `party:rental_included` | レンタル込み（券の included_items=rental、または名称にレンタル） |
| `party:family_offer_without_rule` | family/group の割引理由があるのに party_rules が無い |

## レンタル（rental）

| キー | 意味 |
|---|---|
| `rental:present` / `rental:absent` | rentals がある／空（未収集または無し） |
| `rental:shops=multiple` | 店舗が複数 |
| `rental:duration.mode=<mode>` | 期間（day, half_day, hours, days, extra_day, night, unknown） |
| `rental:duration.mode=extra_day:after_days=<1\|2\|3plus>` | 延長が何日目より後か（省略は1） |
| `rental:duration.days_ge7` | 7日以上の連続日料金 |
| `rental:half_day.start_time_stated` / `.no_start_time` / `.hours_stated` | 半日の開始時刻・時間数の記載 |
| `rental:night.start_time_stated` / `rental:hours.start_time_stated` | ナイター／時間料金の開始時刻の記載 |
| `rental:item=<用具>` / `rental:items.multiple` | 含まれる用具（ski_set, snowboard_set, skis, ski_boots, poles, snowboard, snowboard_boots, snowboard_bindings, wear, wear_top, wear_bottom, helmet, goggles, gloves, unknown）／1件に複数用具 |
| `rental:wear.whole` / `rental:wear.split_top_bottom` | ウェア一式／上下を分けた件 |
| `rental:grade` / `rental:channel_specified` / `rental:purchase_deadline` / `rental:calendar_specific` / `rental:use_period` / `rental:sales_period` | グレード／予約・Web割／予約期限／平日休日・期間で変わる／利用期間／販売期間 |
| `rental:qualification` / `rental:qualification=<種類>` | 資格条件（上限として読む）: `lodging_guest`, `resident`, `lift_ticket_buyer`, `member_holder`, `student`, `coupon_presenter`, `lesson` |
| `rental:price.amount_null` | 金額が null |
| `rental:audience.multiple_per_item` | 1件が複数の対象区分を参照 |
| `rental:audience_basis=school` / `age` / `school_and_age` / `single` | レンタルの区分の決め方（学校／年齢／両方／区分1つ） |
| `rental:default_audience_differs_from_lift` / `rental:audience_differs_from_lift` | レンタル専用区分の基準区分・子ども区分が券の区分と違う |
| `rental:size_by_height` / `rental:size_stated_in_name` | 名称に身長(cm)／サイズ・長さ（上限として読む） |
| `rental:usable_at_night=true` / `false` / `unrecorded_with_night` | 日中レンタルがナイター終了まで使えるか。ナイター営業があるのに記録が無い場合は `unrecorded_with_night` |
| `rental:bundled_with_lift_ticket` / `rental:with_night_hours` / `rental:night_rental_exists` | 券とのセット商品がある／ナイター営業×レンタル／ナイター用レンタルがある |

## 手数料（fee）

| キー | 意味 |
|---|---|
| `fee:present` | fees がある |
| `fee:unit=<per_person\|per_ticket\|per_transaction\|unknown\|unspecified>` | 課金の単位（省略は `unspecified`） |
| `fee:channel_limited` / `fee:product_limited` | 販売経路／券を限定した手数料 |
| `fee:amount_null` | 金額が null |
| `fee:deposit_named` | 名称に保証金・デポジット（上限として読む。data-model では fees に入れない約束なので、出たら要確認） |

## 雪マジ（yukimaji）

`<kind>` は `free`（無料クーポン）か `discount`（割引クーポン）。

| キー | 意味 |
|---|---|
| `yukimaji:status=listed` / `preparing` | 掲載状態 |
| `yukimaji:<kind>.day_rule=<rule>` | 曜日条件（all, weekday, weekend_holiday, saturday_sunday, weekday_and_saturday, mon_thu_excluding_holiday, listed_dates, by_period, unknown） |
| `yukimaji:<kind>.period_rule.day_rule=<rule>` | by_period の期間ごとの曜日条件 |
| `yukimaji:<kind>.period_approximate` / `.period_absent` | 期間の境界が概数／期間の記載なし |
| `yukimaji:<kind>.excluded_date_ranges` / `.excluded_dates_unspecified` / `.holiday_treatment_stated` | 除外期間／除外日あり（日付なし）／祝日の扱いの記載 |
| `yukimaji:<kind>.max_uses=<1\|2\|3plus\|unlimited>` | 利用回数の上限 |
| `yukimaji:<kind>.night_policy=<allowed\|not_allowed\|unknown>` | ナイターの扱い |
| `yukimaji:<kind>.time_window` | 時間の制限 |
| `yukimaji:<kind>.target_modes=<利用単位+...>` | 対象券の利用単位（1日券・時間券・時間帯券など） |
| `yukimaji:<kind>.target_choice` / `.target_shared_product` / `.target_night_only` | 対象が複数券の選択制／共通券限定／ナイター券のみ |
| `yukimaji:<kind>.price_effect=<type>` | 価格ルールの効き方（free, fixed_total, discount_amount, discount_percent など） |
| `yukimaji:<kind>.price_by_use_number` / `.price_by_calendar` / `.price_by_product` | 回数で変化／平日休日で別／券ごとに別 |
| `yukimaji:free_without_discount` / `yukimaji:discount_without_free` | 無料だけ／割引だけ |
| `yukimaji:free_discount_period_differs` / `yukimaji:free_discount_day_rule_differs` | 無料と割引で期間・曜日条件がずれる |
| `yukimaji:fee=refundable` / `non_refundable` | 追加費用（保証料は返金あり、入場料・発行手数料は返金なし） |
| `yukimaji:rental_benefit=<type\|described_only>` / `yukimaji:rental_benefit.requirements` | レンタル特典（額の型。額の記載なしは described_only）／特典の条件 |
| `yukimaji:rental_restriction` / `yukimaji:shared_use_count` / `yukimaji:other_benefits` / `yukimaji:resort_requirements` | 外部レンタル対象外／2施設合算／他特典／施設固有の提示物 |

## 金額の組み合わせで決まる特徴（price）

| キー | 意味 |
|---|---|
| `price:long_hours_cheaper_than_day` | 7時間以上の時間券の最安が、標準の1日券の最安より安い（恐羅漢型） |
| `price:long_hours_cheaper_than_day.limited_period` | 上のうち、安い側の料金が利用期間・期間カレンダーで限定されている |
| `price:online_higher_than_standard` | Web（理由が online_purchase だけ）の最安が、同じ券の標準料金（窓口）の最安より高い |
| `price:bundle_cheaper_than_plain_ticket` | 付いている物のある券の最安が、同じ長さの付属なしの券より安い |
| `price:rental_bundle_cheaper_than_parts` | レンタル込みの券の最安が、付属なしの券＋日帰りレンタル最安の合計より安い（セット券がバラより安い） |

## 主要な組み合わせ（combo）

全組み合わせは数が多いので次の4種に絞る。

| キー | 意味 |
|---|---|
| `combo:hours=<型>×day_pass=<present\|absent>` | 営業時間の型 × 1日券の有無。型は `regular` / `regular+night` / `regular+early_morning` / `regular+night+early_morning` / `regular_no_times` / `night` / `early_morning` / `unknown` / `empty` など |
| `combo:night=<daily\|day_types\|dates\|period>×day_pass_covers_night=<yes\|no\|no_day_pass>` | ナイターの型（毎日／曜日限定／日付限定／期間指定）× 1日券がナイターを含むか |
| `combo:night×night_only_product=<present\|absent>` | ナイター営業 × ナイター単独券の有無 |
| `combo:party_rule×rental_included=<yes\|no>` | 同行者ルールがある施設で、レンタル込みのルールがあるか |
| `combo:rental×rental_bundled_ticket=<yes\|no>` | レンタルがある施設で、レンタル込みの券があるか |

## 抽出しないもの

- 券の共有可否（25時間券を2人で分けられる）: フィールドが無く、文言（notes）にしか無い。
- レンタルの「身分証の確認が必要」: notes にしか書かれない。構造化されたら足す。
- 照会日・利用日に依存する判定（Web販売の開始が照会日より後、離れた日の連続日券不可など）: 計算側のテストで見る。
