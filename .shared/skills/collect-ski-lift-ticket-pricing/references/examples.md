# 具体例集

完全な例は `../tests/fixtures/valid/yukigaoka-2025-2026.json`（架空スキー場の
フル例。全パターンを含み、3つの検証スクリプトを通過する）を参照。
以下は代表パターンの抜粋。

## 0. カレンダーの指定方法（日付→料金が引ける形にする）

平日・土日祝は `day_types`（標準カレンダー準拠）、年末年始・特定日は
公式資料の日付を明示する。優先度は `dates` ＞ `date_ranges` ＞ `day_types`。

```json
{
  "calendars": [
    { "id": "cal-weekday", "name_ja": "平日", "calendar_type": "weekday",
      "day_types": ["weekday"], "source_refs": ["src-page-001"] },
    { "id": "cal-holiday", "name_ja": "土日祝", "calendar_type": "weekend_holiday",
      "day_types": ["saturday", "sunday", "public_holiday"], "source_refs": ["src-page-001"] },
    { "id": "cal-yearend", "name_ja": "年末年始", "calendar_type": "year_end_new_year",
      "day_types": ["year_end_new_year"],
      "date_ranges": [{ "start": "2025-12-28", "end": "2026-01-03" }],
      "official_label_ja": "年末年始（12/28〜1/3）", "source_refs": ["src-page-001"] },
    { "id": "cal-ladies", "name_ja": "レディースデー対象日", "calendar_type": "special_day",
      "dates": ["2026-01-08", "2026-01-15"], "source_refs": ["src-page-001"] }
  ],
  "offers": [
    {
      "id": "offer-adult-day",
      "price": {
        "mode": "date_table",
        "date_table": [
          { "calendar_id": "cal-weekday", "amount": 6000, "source_refs": ["src-page-001"] },
          { "calendar_id": "cal-holiday", "amount": 6500, "source_refs": ["src-page-001"] },
          { "calendar_id": "cal-yearend", "amount": 7000, "source_refs": ["src-page-001"] }
        ]
      }
    }
  ]
}
```

日付を指定して料金を引く（1/1は祝日だが年末年始の明示期間が優先され7,000円）:

```bash
node scripts/lookup-price.mjs tickets/yukigaoka/2025-2026.json \
  --date 2026-01-01 --audience adult --product day-pass
# 祝日・平日の判定は scripts/jp-holidays.mjs（振替休日・国民の休日込み）
```

公式が独自定義（例:「祝日は平日料金」）の場合のみ、`dates` /
`excluded_dates` の明示指定で標準カレンダーを上書きし、公式表記を
`notes_ja` に写す。

## 1. 地域割引（道民割）

`geographic_areas` に地域を定義し、offerの `eligibility_conditions` で参照する。
「県民の大人」のようなaudienceは作らない。

```json
{
  "geographic_areas": [
    { "id": "hokkaido", "name_ja": "北海道", "level": "prefecture", "parent_id": null }
  ],
  "offers": [
    {
      "id": "offer-adult-day-dominwari",
      "name_ja": "大人1日券（道民割）",
      "official_label_ja": "道民割引1日券",
      "offer_type": "discounted",
      "discount_reasons": ["local_resident"],
      "eligibility_conditions": [
        {
          "type": "area_relationship",
          "relationships": ["resident"],
          "area_ids": ["hokkaido"],
          "match": "any",
          "proof_types": ["address_proof"],
          "source_refs": ["src-page-001"]
        }
      ],
      "price": { "mode": "fixed", "currency": "JPY", "amount": 5500 }
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
**当日購入可か・期限があるかで分類が変わり、`purchase_deadline` は
オンライン券に必須**。

前日までの期限がある前売り（`advance_purchase` を付ける）:

```json
{
  "official_label_ja": "WEB前売スペシャル",
  "offer_type": "discounted",
  "discount_reasons": ["online_purchase", "advance_purchase"],
  "channel_ids": ["web-shop"],
  "sales_period": { "start": "2025-11-01", "end": "2026-03-28", "deadline_ja": "利用日前日23:59まで" },
  "purchase_deadline": {
    "mode": "relative",
    "days_before_use": 1,
    "time_of_day": "23:59",
    "official_text_ja": "利用日前日23:59まで",
    "source_refs": ["src-page-webshop"]
  },
  "price": { "mode": "fixed", "currency": "JPY", "amount": 5800 }
}
```

当日でも買えるWeb券（`online_purchase` のみ）:

```json
{
  "discount_reasons": ["online_purchase"],
  "purchase_deadline": { "mode": "same_day_allowed", "official_text_ja": "当日購入OK" }
}
```

当日内の期限（利用15分前まで等。これも `online_purchase` のみ）:

```json
{
  "discount_reasons": ["online_purchase"],
  "purchase_deadline": { "mode": "relative", "minutes_before_use": 15, "official_text_ja": "リフト利用開始15分前まで" }
}
```

期限の記載が資料に無い場合（「期限なし」と推測しない）:

```json
{
  "purchase_deadline": { "mode": "not_stated", "official_text_ja": null, "notes_ja": "公式ページに購入期限の記載なし" }
}
```

`web-shop` channel は `channel_type: "online"` かつ `url` を持つこと。

## 3. レディースデーと子供デー

- レディースデー: **日付条件**（calendar）＋**対象者条件**の両方が必須
- 子供デー: 通常の子供料金と別offerにし、calendarで日付を限定する

```json
{
  "calendars": [
    { "id": "cal-ladies", "name_ja": "レディースデー対象日", "calendar_type": "special_day",
      "dates": ["2026-01-08", "2026-01-15"], "source_refs": ["src-page-001"] }
  ],
  "offers": [
    {
      "id": "offer-ladies-day",
      "official_label_ja": "レディースデー",
      "offer_type": "discounted",
      "discount_reasons": ["ladies_day"],
      "calendar_ids": ["cal-ladies"],
      "eligibility_conditions": [
        {
          "type": "other",
          "official_label_ja": "レディースデー",
          "description_ja": "女性を対象とした割引（taxonomyに性別条件が無いためother）",
          "taxonomy_review_required": true,
          "source_refs": ["src-page-001"]
        }
      ]
    }
  ]
}
```

## 4. party rule（大人1人につき未就学児2人無料）

個人向けofferで無理に表現せず、`party_rules` に構造化する。

```json
{
  "id": "rule-preschool-free",
  "name_ja": "大人同伴の未就学児無料",
  "official_label_ja": "未就学児無料（保護者同伴）",
  "rule_type": "companion_free",
  "description_ja": "リフト券購入の大人1名につき未就学児2名までリフト券無料",
  "components": [
    {
      "role_ja": "大人（リフト券購入者）",
      "audience_ids": ["adult"],
      "min_count": 1,
      "price_effect": { "type": "other", "notes_ja": "通常料金を支払う" }
    },
    {
      "role_ja": "未就学児",
      "audience_ids": ["preschool"],
      "per_qualifying_count": 2,
      "price_effect": { "type": "free", "amount": 0 }
    }
  ],
  "source_refs": ["src-page-001"],
  "confidence": "high"
}
```

## 5. 動的価格（ダイナミックプライシング）

金額を推測・固定化しない。取得時の観測値は `observed_amount` に分離する。

```json
{
  "offer_type": "dynamic",
  "price": {
    "mode": "live_dynamic",
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
      "type": "image",
      "url": "https://example.com/img/night-price.png",
      "path": "downloads/night-price.png",
      "linked_from_source_id": "src-page-001",
      "user_specified": false,
      "reading_confidence": "medium",
      "notes_ja": "ナイター料金表の画像。シニア欄の金額が低解像度で判読不能"
    }
  ],
  "offers": [
    {
      "id": "offer-night-senior",
      "offer_type": "standard",
      "price": { "mode": "unknown", "amount": null },
      "confidence": "unknown",
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

## 8. 複数スキー場の共通券（shared_pass）

どのスキー場と共通かを必ず明記し、**相手スキー場側のJSONにも同じ共通券を
記載する**。

```json
{
  "products": [
    {
      "id": "two-resort-pass",
      "name_ja": "A・B共通1日券",
      "validity": { "mode": "calendar_day", "days": 1 },
      "shared_with_resorts": [
        {
          "resort_id": "resort-b",
          "name_ja": "Bスキー場",
          "official_label_ja": "2山共通1日券",
          "notes_ja": "Bスキー場側のJSONにも同じ共通券を記載する。",
          "source_refs": ["src-page-001"]
        }
      ],
      "source_refs": ["src-page-001"]
    }
  ]
}
```

## 9. 昼食付き・温泉付きなどのセット券（package + included_items）

```json
{
  "products": [
    {
      "id": "day-pass-lunch",
      "name_ja": "1日券＋ランチパック",
      "validity": { "mode": "calendar_day", "days": 1 },
      "included_items": [
        { "type": "lunch", "name_ja": "場内レストラン食事券",
          "official_label_ja": "ランチ券1,000円分", "value_amount": 1000,
          "source_refs": ["src-page-001"] }
      ],
      "source_refs": ["src-page-001"]
    }
  ],
  "offers": [
    { "id": "offer-lunch-pack-adult", "offer_type": "package",
      "product_id": "day-pass-lunch",
      "price": { "mode": "fixed", "currency": "JPY", "amount": 7500 } }
  ]
}
```

温泉付きなら `"type": "onsen"`、レンタル付きなら `"type": "rental"` など
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
