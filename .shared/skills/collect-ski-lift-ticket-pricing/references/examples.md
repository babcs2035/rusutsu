# 具体例集

完全な例は `../tests/fixtures/valid/yukigaoka-2025-2026.json`（架空スキー場の
フル例。全パターンを含み、3つの検証スクリプトを通過する）を参照。
以下は代表パターンの抜粋。

## 0. カレンダーの指定方法（日付→料金が引ける形にする）

平日・土日祝は `included_day_types`（標準カレンダー準拠）、年末年始・特定日は
公式資料の日付を明示する。料金区分を移す日は、元区分のexcludeと適用先区分の
includeを必ずペアで記録する。暗黙のカレンダー優先順位はない。

```json
{
  "id": "cal-weekday",
  "included_day_types": ["weekday"],
  "excluded_date_ranges": [
    { "start": "2025-12-29", "end": "2026-01-03" }
  ]
}
{
  "id": "cal-holiday",
  "included_day_types": ["saturday", "sunday", "public_holiday"],
  "included_date_ranges": [
    { "start": "2025-12-29", "end": "2026-01-03" }
  ]
}
```

`kids_day` / `special_day` 等の割引日は通常料金から除外せず、両方を候補に残す。

```json
{
  "offers": [
    {
      "id": "offer-adult-day-weekday",
      "official_label_ja": "リフト1日券（おとな・平日）",
      "audience_ids": ["adult"],
      "calendar_ids": ["cal-weekday"],
      "price": { "currency": "JPY", "amount": 6000 },
      "source_refs": ["src-page-001"]
    },
    {
      "id": "offer-adult-day-holiday",
      "official_label_ja": "リフト1日券（おとな・土日祝）",
      "audience_ids": ["adult"],
      "calendar_ids": ["cal-holiday"],
      "price": { "currency": "JPY", "amount": 6500 },
      "source_refs": ["src-page-001"]
    },
    {
      "id": "offer-adult-day-yearend",
      "official_label_ja": "リフト1日券（おとな・年末年始）",
      "audience_ids": ["adult"],
      "calendar_ids": ["cal-yearend"],
      "price": { "currency": "JPY", "amount": 7000 },
      "source_refs": ["src-page-001"]
    }
  ]
}
```

★**1 offer = 1 金額。** 日付で料金が変わるならカレンダーごとに offer を分ける
（`price.date_table` は廃止した）。

日付を指定して料金を引く（1/1は通常の祝日区分から除外され、年末年始料金の
明示期間に含まれるため7,000円）:

```bash
node scripts/lookup-price.mjs tickets/yukigaoka/2025-2026.json \
  --date 2026-01-01 --audience adult --product day-pass
# 祝日・平日の判定は scripts/jp-holidays.mjs（振替休日・国民の休日込み）
```

公式が独自定義（例:「祝日は平日料金」）の場合は、休日側の
`excluded_dates` / `excluded_date_ranges` と平日側の
`included_dates` / `included_date_ranges` をペアで記録し、公式表記を
`notes_ja` に写す。

## 1. 地域割引（道民割）

**地域を構造化しない。** 公式表記と誰が対象かを `target_qualification` の文章で残す
（照会の入力に居住地が無いので、都道府県／市町村や居住／在勤／在学を分類しても
料金計算に効かない）。「県民の大人」のようなaudienceは作らない
（audienceは料金表の行であり、地域はそれと直交する）。
証明書は絞り込み条件ではなく持ち物なので `requirements` へ。

```json
{
  "offers": [
    {
      "id": "offer-adult-day-dominwari",
      "name_ja": "大人1日券（道民割）",
      "official_label_ja": "道民割引1日券",
      "discount_reasons": ["local_resident"],
      "target_qualification": {
        "official_label_ja": "北海道にお住まいの方",
        "description_ja": "北海道に住所がある方",
        "source_refs": ["src-page-001"]
      },
      "requirements": [
        {
          "description_ja": "住所を確認できるものの提示が必要",
          "proof_ja": "住所を確認できるもの",
          "source_refs": ["src-page-001"]
        }
      ],
      "price": { "currency": "JPY", "amount": 5500 }
    }
  ]
}
```

居住・在勤・在学の全部が対象なら
`"relationships": ["resident", "employed", "enrolled"], "match": "any"`。
「地元の方」で対象地域が公式に特定できなければ area を推測せず
`{ "type": "unknown", "description_ja": "対象地域の定義が公式資料に無い", "unresolved": true }`。

## 2. WEB購入と前売り（online_purchase / advance_purchase と purchase_deadline）

複合ラベル（`web_advance_discount` 等）を新設せず、配列で表す。

`purchase_deadline` は `same_day_allowed`（当日買えるか）/
`days_before_use`（何日前までか・1日単位）/ `deadline_date`（固定期限）/
`official_text_ja`（公式表記）。**当日内の分単位の期限（「15分前まで」等）は
構造化せず `official_text_ja` にだけ書く**（1日単位の判定に効かないため）。
**窓口・券売機だけで買う券には書かない**（「当日その場で買う」以外の選択肢が
無いため情報にならない）。**購入URLがある券には必須**（「今日これを買えるのか」は
実際に問われる）。

前日までの期限がある前売り（`advance_purchase` を付ける）:

```json
{
  "official_label_ja": "WEB前売スペシャル",
  "discount_reasons": ["online_purchase", "advance_purchase"],
  "channel_ids": ["web-shop"],
  "sales_period": { "start": "2025-11-01", "end": "2026-03-28", "deadline_ja": "利用日前日23:59まで" },
  "purchase_deadline": {
    "same_day_allowed": false,
    "days_before_use": 1,
    "official_text_ja": "利用日前日23:59まで",
    "source_refs": ["src-page-webshop"]
  },
  "price": { "currency": "JPY", "amount": 5800 }
}
```

当日でも買えるWeb券（`online_purchase` のみ）:

```json
{
  "discount_reasons": ["online_purchase"],
  "purchase_deadline": { "same_day_allowed": true, "days_before_use": 0, "official_text_ja": "当日購入OK" }
}
```

当日内の期限（利用15分前まで等。これも `online_purchase` のみ）。
**分単位の期限は公式表記にだけ書く**:

```json
{
  "discount_reasons": ["online_purchase"],
  "purchase_deadline": { "same_day_allowed": true, "days_before_use": 0, "official_text_ja": "リフト利用開始15分前まで" }
}
```

固定期限（「1/31まで販売」）:

```json
{
  "discount_reasons": ["online_purchase", "advance_purchase"],
  "purchase_deadline": { "same_day_allowed": false, "deadline_date": "2026-01-31", "official_text_ja": "2026年1月31日まで販売" }
}
```

期限の記載が資料に無い場合（「期限なし」と推測しない）:

```json
{
  "purchase_deadline": { "same_day_allowed": null, "official_text_ja": null, "notes_ja": "公式ページに購入期限の記載なし" }
}
```

`web-shop` channel は購入ページの `url` を持つこと（購入場所の分類ラベルは持たない）。

## 3. レディースデーと子供デー

- レディースデー: **日付条件**（calendar）＋**対象者条件**の両方が必須
- 子供デー: 通常の子供料金と別offerにし、calendarで日付を限定する

```json
{
  "calendars": [
    { "id": "cal-ladies", "name_ja": "レディースデー対象日", "calendar_type": "special_day",
      "included_dates": ["2026-01-08", "2026-01-15"], "source_refs": ["src-page-001"] }
  ],
  "offers": [
    {
      "id": "offer-ladies-day",
      "official_label_ja": "レディースデー",
      "discount_reasons": ["special_day"],
      "calendar_ids": ["cal-ladies"],
      "audience_ids": ["adult"],
      "target_genders": {
        "genders": ["female"],
        "official_label_ja": "レディースデー",
        "source_refs": ["src-page-001"]
      }
    }
  ]
}
```

## 4. party rule（大人1人につき未就学児2人無料）

個人向けofferで無理に表現せず、`party_rules` に構造化する。
**ルールの種類を表す `rule_type` は持たない**（合計金額は `price_effect` と
`per_qualifying_count` だけで決まり、種類ラベルは表示にしか使われていなかった）。

★**「大人1名につき」の大人は資格の判定であって、このルールで買う人ではない。**
比率指定 (`per_qualifying_count`) を持つcomponentより前のcomponentは資格側とみなし、
人数だけ数えて消費しない（消費すると「ペア券×2 ＋ 未就学児無料」が成立しなくなる）。
資格側の `price_effect` は `null`（＝通常料金のまま別に購入）にする。

```json
{
  "id": "rule-preschool-free",
  "name_ja": "大人同伴の未就学児無料",
  "official_label_ja": "未就学児無料（保護者同伴）",
  "description_ja": "リフト券購入の大人1名につき未就学児2名までリフト券無料",
  "components": [
    {
      "role_ja": "大人（リフト券購入者）",
      "audience_ids": ["adult"],
      "min_count": 1,
      "price_effect": null
    },
    {
      "role_ja": "未就学児",
      "audience_ids": ["preschool"],
      "per_qualifying_count": 2,
      "price_effect": { "type": "free", "amount": 0 }
    }
  ],
  "source_refs": ["src-page-001"]
}
```

## 5. 動的価格（ダイナミックプライシング）

金額を推測・固定化しない。取得時の観測値は `observed_amount` に分離する。

```json
{
  "price": {
    "currency": "JPY",
    "amount": null,
    "live_lookup_required": true,
    "live_lookup_url": "https://example.com/shop/day-pass",
    "observed_at": "2026-07-18T03:00:00Z",
    "observed_amount": 6200
  }
}
```

## 6. 画像料金表と判読不能箇所

画像を根拠とするsourceには保存パスと読み取り確信度を必ず入れる。
判読できない金額は `unknown` とし、`illegible_items` で紐づける
（紐づいたofferに確定料金が入っているとcoverageチェックが落ちる）。

```json
{
  "sources": [
    {
      "id": "src-img-night",
      "url": "https://example.com/img/night-price.png",
      "path": "downloads/night-price.png",
      "linked_from_source_id": "src-page-001",
      "user_specified": false,
      "notes_ja": "ナイター料金表の画像。シニア欄の金額が低解像度で判読不能"
    }
  ],
  "offers": [
    {
      "id": "offer-night-senior",
      "price": { "amount": null, "notes_ja": "画像の該当セルが判読不能のため金額未確定。" },
      "source_refs": ["src-img-night"]
    }
  ],
  "data_quality": {
    "illegible_items": [
      {
        "id": "illegible-night-senior",
        "description_ja": "ナイター料金表画像のシニア料金が判読不能",
        "source_refs": ["src-img-night"],
        "related_offer_ids": ["offer-night-senior"]
      }
    ]
  }
}
```

## 7. ICカード保証金と手数料

チケット料金と分離し、返金有無を区別する。

```json
{
  "fees": [
    { "id": "fee-ic-deposit", "name_ja": "ICカード保証金", "fee_type": "ic_card_deposit",
      "amount": 500, "currency": "JPY", "refundable": true,
      "refund_conditions_ja": "返却機での返却時に返金", "source_refs": ["src-page-001"] },
    { "id": "fee-reissue", "name_ja": "再発行手数料", "fee_type": "reissue_fee",
      "amount": 1000, "currency": "JPY", "refundable": false, "source_refs": ["src-page-001"] }
  ]
}
```

## 8. 単独券と共通券の両方があるスキー場

★**苗場とかぐらのように、そのスキー場だけの券と隣接スキー場との共通券の
両方が売られている**場合がある。**`shared_with_resorts` が空なら単独券、
1件以上あれば共通券**（「単独券か共通券か」を表す分類ラベルは持たない）。

```json
{
  "products": [
    {
      "id": "day-pass",
      "name_ja": "リフト1日券",
      "validity": { "mode": "calendar_day", "days": 1 },
      "shared_with_resorts": [],
      "source_refs": ["src-page-001"]
    },
    {
      "id": "two-resort-pass",
      "name_ja": "2山共通1日券",
      "official_label_ja": "苗場・かぐら共通1日券",
      "validity": { "mode": "calendar_day", "days": 1 },
      "shared_with_resorts": [
        {
          "resort_id": "kagura",
          "name_ja": "かぐらスキー場",
          "official_label_ja": "苗場・かぐら共通",
          "notes_ja": "共通券のため、かぐら側のJSONにも同じ共通券を記載すること。",
          "source_refs": ["src-page-001"]
        }
      ],
      "source_refs": ["src-page-001"]
    }
  ]
}
```

- `resort_id` は `SkiResort.id` と一致させる（**画面から相手スキー場へ辿るために必須**。
  マスタに無いスキー場なら null にして `human_review_required` に記録する）
- **相手スキー場側のJSONにも同じ共通券を記載する**（片方だけに書かない）
- `validity` は利用単位のまま（共通1日券なら `calendar_day` / `days: 1`）

照会時は単独券／共通券で絞り込める:

```bash
node scripts/lookup-price.mjs <tickets.json> --date 2026-01-14 --scope single
node scripts/lookup-price.mjs <tickets.json> --date 2026-01-14 --scope shared
```

画面では「このスキー場のみ / 共通券（かぐらスキー場）」の切り替えに使う。

## 9. 昼食付き・温泉付きなどのセット券（package + included_items）

```json
{
  "products": [
    {
      "id": "day-pass-lunch",
      "name_ja": "1日券＋ランチパック",
      "validity": { "mode": "calendar_day", "days": 1 },
      "included_items": [
        { "type": "meal", "name_ja": "場内レストラン食事券",
          "official_label_ja": "ランチ券1,000円分", "value_amount": 1000,
          "source_refs": ["src-page-001"] }
      ],
      "source_refs": ["src-page-001"]
    }
  ],
  "offers": [
    { "id": "offer-lunch-pack-adult",
      "product_id": "day-pass-lunch",
      "price": { "currency": "JPY", "amount": 7500 } }
  ]
}
```

温泉・風呂付きなら `"type": "bath"`、レンタル付きなら `"type": "rental"` など
（taxonomyの `included_item_types` 参照）。

## 10. 学生区分（大学院生を含むかを明示する）

公式表記が範囲を明記している場合のみ該当 `school_levels` を並べる。

```json
{
  "audiences": [
    {
      "id": "student",
      "name_ja": "学生",
      "official_label_ja": "学生（大学生・大学院生・短大生・専門学校生）",
      "school_levels": ["university", "graduate", "junior_college", "vocational"],
      "source_refs": ["src-page-001"]
    }
  ]
}
```

公式が「大学生」としか書いていない場合は `["university"]` のみとし、
「大学院生を含むか不明」を `data_quality.unresolved_questions` に記録する。
