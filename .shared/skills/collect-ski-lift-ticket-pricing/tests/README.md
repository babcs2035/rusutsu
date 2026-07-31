# テスト

## 実行方法

```bash
# 検証スクリプト3種のテスト（fixtureベース）
node .shared/skills/collect-ski-lift-ticket-pricing/tests/run-tests.mjs

# Playwrightによる取得処理まで確認（playwrightブラウザが必要）
node .shared/skills/collect-ski-lift-ticket-pricing/tests/run-tests.mjs --with-capture
```

## fixtureの構成

### fixtures/valid/ — 3スクリプトすべてを通過すること

- `yukigaoka-2025-2026.json` — 架空スキー場のフル例。以下を網羅する:
  - HTMLの通常料金表（平日/土日祝/年末年始をcalendar別のofferで記録）
  - JavaScript（API）で表示される料金と保存済みJSON資料
  - PDF料金表（年末年始料金・ファミリーパックの根拠）
  - 画像料金表（ナイター券。判読不能箇所は `illegible_items` に記録）
  - 画像の一部が判読不能なケース（シニアナイター= `unknown` ＋
    `illegible_items`。推測せずに通過する正しい形）
  - 地域割引（道民割: `target_qualification` の公式表記＋対象者の文章）
  - WEB前売（`online_purchase` ＋ `advance_purchase` ＋ `purchase_deadline`
    の前日期限）と当日購入可のWeb券（`same_day_allowed`）
  - レディースデー（日付条件＋対象者条件）と子供デー（通常子供料金と別offer）
  - party rule（大人1人につき未就学児2人無料 / ファミリーパック）
  - 動的価格（`live_lookup_required: true`, `amount: null`, `observed_at`）
  - ICカード保証金（返金あり）と再発行手数料（返金なし）の分離
  - 学生区分（大学院生・短大・専門を含むことが明記されたaudience）
  - 昼食付きセット券（`included_items`）
  - 2スキー場共通券（`shared_with_resorts`）
- `minimal.json` — 空に近い最小構成（テンプレート相当）

### fixtures/invalid/ — ファイル名プレフィックスのスクリプトで失敗すること

| fixture | 落ちるスクリプト | 検証内容 |
| --- | --- | --- |
| `schema-negative-price.json` | validate-schema | 負の価格 |
| `schema-missing-required-price.json` | validate-schema | 必須項目（price）欠落 |
| `schema-invalid-date.json` | validate-schema | 実在しない日付 |
| `schema-season-no-source-refs.json` | validate-schema | シーズン判定の根拠がない |
| `schema-unregistered-label.json` | validate-schema | 未登録ラベル `web_discount`（表記揺れ） |
| `schema-gender-target-empty.json` | validate-schema | `target_genders` に genders が無い |
| `schema-qualification-no-description.json` | validate-schema | `target_qualification` に公式表記・対象者がない |
| `taxonomy-dynamic-as-fixed.json` | check-taxonomy | 動的価格を固定価格として保存 |
| `taxonomy-online-no-url.json` | check-taxonomy | Web割引なのに購入URLがない |
| `taxonomy-online-no-deadline.json` | check-taxonomy | オンライン券に purchase_deadline（当日買えるか）が無い |
| `taxonomy-deadline-without-advance.json` | check-taxonomy | 前日期限があるのに advance_purchase が無い |
| `taxonomy-package-no-included-items.json` | check-taxonomy | package なのに included_items が無い |
| `taxonomy-shared-no-resorts.json` | check-taxonomy | 共通券なのに相手スキー場の明記が無い |
| `taxonomy-local-no-qualification.json` | check-taxonomy | 地域割引なのに `target_qualification` がない（notesのみ） |

| `taxonomy-ladies-day-no-target-genders.json` | check-taxonomy | 公式名称が性別を限定しているのに `target_genders` が無い |
| `taxonomy-audience-no-default.json` | check-taxonomy | 条件を満たさない人が買える区分（is_default）が無い |
| `taxonomy-audience-two-defaults.json` | check-taxonomy | is_default が2つあり通常料金が決まらない |
| `taxonomy-audience-unresolvable.json` | check-taxonomy | 年齢も学校区分も無く誰に当たるか決まらない |
| `taxonomy-age-inferred-from-school.json` | check-taxonomy | 学校区分から年齢を推測している（公式表記に無い数値） |
| `taxonomy-open-ended-enumerated.json` | check-taxonomy | 「高校生以上」を有限列挙にしている |
| `taxonomy-school-level-not-notified.json` | check-taxonomy | 6区分外の学校区分を人間に通知していない |
| `taxonomy-no-operating-hours.json` | check-taxonomy | offerがあるのに営業時間が無い |
| `taxonomy-closed-with-hours.json` | check-taxonomy | 定休日 (`closed`) に営業時間が入っている |
| `taxonomy-special-day-no-included_dates.json` | check-taxonomy | `special_day` に対象日カレンダーが無い |
| `taxonomy-special-day-no-explicit-included_dates.json` | check-taxonomy | `day_type: special` 単独で日付が特定できない |
| `taxonomy-year-end-no-included_dates.json` | check-taxonomy | 年末年始カレンダーに期間の明示が無い |
| `taxonomy-year-end-undefined.json` | check-taxonomy | 平日/休日カレンダーがあるのに年末年始の扱いが未定義 |
| `coverage-missing-id-reference.json` | check-coverage | 存在しないID参照 |
| `coverage-no-source-refs.json` | check-coverage | source_refsのない確定料金 |
| `coverage-age-overlap.json` | check-coverage | 年齢区分の重複 |
| `coverage-illegible-price-guessed.json` | check-coverage | 判読不能箇所に確定料金（＝推測）が入っている |
| `coverage-period-inverted.json` | check-coverage | 販売期間の逆転 |

ランナーは「前段のスクリプトは通過し、指定スクリプトで失敗する」ことを
確認する（例: `coverage-*` は schema / taxonomy を通過した上で coverage で
落ちなければならない）。

### lookup-price のシナリオテスト

ランナーは `scripts/lookup-price.mjs` をフル例に対して実行し、
「日付を入力したら料金が引ける」ことを確認する:

- 平日（2026-01-14）→ 6,000円、道民割は導出で 5,000円
- 祝日（2026-01-12 成人の日を祝日計算で判定）→ 6,500円
- 年末年始（2026-01-01。通常祝日から除外し年末年始へ包含）→ 7,000円
- レディースデー（2026-01-08）→ 対象日のみ 4,500円 offer が出る
  （`target_genders` で女性に限定され、女性以外には代表にならない）
- WEB前売の期限（purchase_deadline）と動的価格（amount null）の表示

### fixtures/capture/

- `price-page.html` — capture-sources のテスト用ページ。JSで動的に挿入される
  料金、`details` アコーディオン内の料金、PDF/ショップへのリンクを含む。
  `--with-capture` 実行時に file:// URL で取得し、manifest / page.html /
  visible-text.txt（JS実行後・展開後のテキストを含む）/ screenshot.png /
  links.json の生成を確認する。

## fixtureの追加方法

- 正常系: `fixtures/valid/` に置くだけでランナーが拾う
- 異常系: どのスクリプトで落ちるべきかに応じて `schema-` / `taxonomy-` /
  `coverage-` プレフィックスを付けて `fixtures/invalid/` に置く

`.tmp/` はテスト実行時の一時出力（gitignore対象）。
