# 不足の点検項目（find-lift-ticket-gaps.mjs）

各項目は「画面のどの機能に要るか」と「どう埋めるか」を持つ。埋める情報は必ず公式資料から取り、
収集の決まりは `collect-ski-lift-ticket-pricing` の SKILL.md・references に従う。
公式に無いことは作らず、`notes_ja`・`data_quality`・MISSING.md に残して点検から外れるようにする。

**収集スキルに新しい決まりを足したら、ここと点検スクリプトにも項目を足す。**
既存データは古い決まりで集めたままなので、点検に載らない決まりは既存データに反映されない。

## 優先度A: 利用者に間違った情報を見せている

| 項目 | 何が起きるか | 直し方 |
| --- | --- | --- |
| `calendar-and-written-as-or` | 「平日かつ3月」のつもりで、曜日と長い期間を1つの calendar に並べている。包含は OR なので、期間外の平日や期間内の土日にも料金・営業時間が当てはまる（苗場の平日20才無料が土日にも効く、ホワイトピアの3月平日の営業時間が全平日に効く） | 公式の条件を読み直し、「その期間の、その曜日」なら `included_day_types` だけを残し、期間の外を `excluded_date_ranges` で除く。日付が前シーズンのままなら今季の公式資料で直す |
| （点検スクリプトでは見ない）出典リンクが別の料金を指している | 強調が別の区分・別の割引の箇所に当たる（NASPAの大人早割 ¥4,800 が、先に出るこども1日券の ¥4,800 を指していた） | `verify-quotes.mjs` を全件に流し、強調された箇所の行見出し・列見出し・見出しがその料金と合うか確かめる。合わない引用は `--prune` で外し、`attach-quotes.mjs` で付け直す。手で直さない |

## 優先度B: 画面の機能に要る情報が無い

| 項目 | 画面で困ること | 直し方 |
| --- | --- | --- |
| `file-source-without-page` | 画像・PDFの料金表が、載せているページと結び付いていない。出典リンクが画像ファイルを開くだけで、ページのその位置へ飛べない | 画像・PDFを載せている（リンクしている）公式HTMLページを開いて確かめ、sources に足して `linked_from_source_id` で結ぶ。料金の `source_refs` はそのまま |
| `price-without-quote` | 出典リンクがページを開くだけ（件数は「付いていない数/金額のある料金の数」。割引額だけの割引も含む） | `attach-quotes.mjs` → `verify-quotes.mjs`。金額に色が付かないページは近くの見出し、割引額だけの割引はページの割引の文（「500円引き」）で指す（data-model の source_quotes）。付かない理由がページ側にあるものは残ってよい |
| `web-offer-without-deadline` | Web・前売の券に購入期限の欄も販売終了日も無く、「〇月〇日までにWebで購入」を出せるか分からない | 公式の購入期限（当日可否・何日前まで・締切日）を記録する。記載が無ければ欄を作って値を null、`notes_ja` に「購入期限の記載なし」 |
| `advance-without-end` | 前売りなのに、販売終了日・締切日・何日前まで・当日不可のどれも無い（当日不可なら「前日まで」として期限が出せる） | 公式の販売期間・期限を記録する。本当に記載が無ければ `notes_ja` と MISSING.md に書く |
| `web-offer-without-counter-price` | 同じ券を窓口でも売っているのに、この区分・日付の窓口料金が無く、「通常料金（窓口）¥◯」を並べて出せない。Web・前売だけで売る商品（Web限定の8日券・パック）は対象外 | その区分・日付の窓口料金を公式料金表から offer に足す。公式に無ければ MISSING.md に書く |
| `web-offer-without-url` | 「WEBで購入」から購入ページへ連れて行けない | 公式が案内する購入ページURLを Stage 0 の基準で確かめ、`channels[].url` に書く |
| `night-ticket-without-hours` | ナイター券があるのに、その日がナイター営業日か・何時までかを出せない | ナイターの営業日（`calendars`）と時刻（`operating_hours` の `night`）を公式から記録する。見つからなければ SKILL.md の時刻の探し方（同じ公式サイト → 雪マジ → tenki.jp → ウェザーニュース → 前季）に従う |
| `night-hours-without-time` / `night-hours-without-days` / `night-hours-without-source` | ナイター営業の時刻・営業日・出典が欠けている | 同上 |

## 優先度C: 後から加わった収集項目が無い（古い決まりで集めたデータ）

| 項目 | 直し方 |
| --- | --- |
| `rentals-not-collected` | レンタル料金を収集スキルの「レンタル料金の抽出」に従って集める。公式がレンタルを案内していなければ、その旨を `data_quality.notes_ja` に |
| `night-rental-unchecked` | ナイター営業がある施設で、日中のレンタルを夜も使えるか（`usable_at_night`）をレンタルページ・FAQで調べる。記載が無ければ `unresolved_questions` に残す |
| `yukimaji-not-collected` | 収集スキルの Stage 1b に従って雪マジを確かめる。掲載が無ければ `yukimaji: null` |
| `night-status-unrecorded` | ナイターの有無を確かめる。無ければ `operating_hours` の `notes_ja` に「ナイター営業なし」と書き、確認したページを `source_refs` に付ける |

## 点検できないもの

- 金額・日付が公式と合っているか（点検は欄の有無だけを見る）。直した料金は独立監査で原典と照合する。
- 出典リンクが正しい箇所を指しているか（`verify-quotes.mjs` で確かめる）。
