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
  - HTMLの通常料金表（平日/土日祝/年末年始の `date_table`）
  - JavaScript（API）で表示される料金（`api_response` source）
  - PDF料金表（年末年始料金・ファミリーパックの根拠）
  - 画像料金表（ナイター券。`reading_confidence` 付き）
  - 画像の一部が判読不能なケース（シニアナイター= `unknown` ＋
    `illegible_items`。推測せずに通過する正しい形）
  - 地域割引（道民割: `geographic_areas` ＋ `area_relationship` 条件）
  - WEB前売（`online_purchase` ＋ `advance_purchase` ＋ `purchase_deadline`
    の前日期限）と当日購入可のWeb券（`same_day_allowed`）
  - レディースデー（日付条件＋対象者条件）と子供デー（通常子供料金と別offer）
  - party rule（大人1人につき未就学児2人無料 / ファミリーパック）
  - 動的価格（`live_dynamic`, `amount: null`, `observed_at`）
  - ICカード保証金（返金あり）と再発行手数料（返金なし）の分離
  - 学生区分（大学院生・短大・専門を含むことが明記されたaudience）
  - 昼食付きセット券（`package` ＋ `included_items`）
  - 2スキー場共通券（`shared_pass` ＋ `shared_with_resorts`）
- `minimal.json` — 空に近い最小構成（テンプレート相当）

### fixtures/invalid/ — ファイル名プレフィックスのスクリプトで失敗すること

| fixture | 落ちるスクリプト | 検証内容 |
| --- | --- | --- |
| `schema-negative-price.json` | validate | 負の価格 |
| `schema-missing-required-price.json` | validate | 必須項目（price）欠落 |
| `schema-invalid-date.json` | validate | 実在しない日付 |
| `taxonomy-unregistered-label.json` | check-taxonomy | 未登録ラベル `web_discount`（表記揺れ） |
| `taxonomy-free-nonzero.json` | check-taxonomy | `free` なのに0円ではない |
| `taxonomy-online-onsite-channel.json` | check-taxonomy | Web割引なのに現地channel |
| `taxonomy-local-no-area-condition.json` | check-taxonomy | 地域割引なのに地域条件がない（notesのみ） |
| `taxonomy-other-no-description.json` | check-taxonomy | `other` に説明がない |
| `taxonomy-dynamic-as-fixed.json` | check-taxonomy | 動的価格を固定価格として保存 |
| `taxonomy-online-no-deadline.json` | check-taxonomy | オンライン券に purchase_deadline（当日可/期限/記載なし）が無い |
| `taxonomy-deadline-without-advance.json` | check-taxonomy | 前日期限があるのに advance_purchase が無い |
| `taxonomy-package-no-included-items.json` | check-taxonomy | package なのに included_items が無い |
| `taxonomy-shared-pass-no-resorts.json` | check-taxonomy | 共通券なのに相手スキー場の明記が無い |
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
- 年末年始（2026-01-01。祝日day_typeより明示期間が優先）→ 7,000円
- レディースデー（2026-01-08）→ 対象日のみ 4,500円 offer が出る
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
