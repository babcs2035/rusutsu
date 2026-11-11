# 機械点検の中身（trail-map.mjs check）

人やエージェントがページを見る前に、スクリプトだけで分かることを全部出す。
エージェントは、ここで指摘が出たスキー場だけを見る。

## 何を取得するか

| 対象 | 取得のしかた | 記録するもの |
| --- | --- | --- |
| 登録中のマップ（`mapUrls`） | 本番の詳細画面と同じく `Referer: https://ktak.dev/rusutsu/` を付けて取得。失敗したらRefererなしで再取得 | HTTP状態、転送先、Content-Type、中身の種類（先頭バイト）、大きさ、SHA-256、ETag、Last-Modified、寸法（画像は sharp、PDFは pdfinfo） |
| 掲載元（`mapPageUrls`） | Playwright で開く（画像は読まない） | HTTP状態、転送先、`img`・`srcset`・`picture`・`a`・背景画像のURLとラベル、HTML全文（照合用・保存しない） |
| 掲載元のマップ候補 | ファイル名・alt・リンク文字・近くの見出しの語（ゲレンデ・コース・マップ・map・slope…）で点数付け。ロゴ・料金・アクセスなどは減点 | 点数、URLから推定した年度。古さ・崩れの疑いがある施設は上位3件の寸法も測る |

## 古くなったことの見分け方

1. **掲載元から消えた**（`map-not-on-page`）: 登録中のURLが掲載元のHTMLに出てこない。
   完全一致のほか、パスだけ・デコード後・WordPressのサイズ違い（`-1024x892`）・拡張子違いも同じ図とみなす。
   公式サイトは新しい図を新しいファイル名で上げ直すことが多いので、これが一番強い手がかり。
2. **新しい年度の候補がある**（`newer-candidate`）: 掲載元の候補のURLから推定した年度が、登録中の図の年度より新しい。
   年度の推定は強い順に `2025-26`・`2025-2026`・`25-26` → `/uploads/2025/11/`（7月以降は その年のシーズン）・
   `20251203…` のような保存日時・`2627` のような続き年 → 4桁の年だけ・Last-Modified。
3. **前回から中身が変わった**（`map-content-changed`、`page-candidates-changed`）: 前回確かめた指紋
   （`src/private/data/trail-map-watch/state.json`）と比べる。同じURLで画像が差し替わった、掲載元にマップらしい画像が増えた、を拾う。
4. **掲載元が無い・開けない・トップへ転送される**（`page-missing`・`page-error`・`page-redirected-top`）。
5. **マップ自体が取れない**（`map-error`・`map-not-image`）: 404、サイト移転でトップページ（HTML）に転送される、など。

前回の指紋は、指摘（中以上）の無い施設だけ自動で更新する。指摘が残っている施設は、直すか
`--accept <id,...>` で「これで良い」と確かめるまで前回の指紋を保つので、一度見逃しても次の点検で再び出る。

## 表示の崩れの見分け方

詳細画面の枠は本番で実測した PC 452×303px、スマホ 375×249px（`lib.mjs` の `FRAMES`）。
画像は枠に合わせて縮むが拡大はしない（`object-contain` + `max-w/max-h`）。PDFは枠に合わせる（`view=Fit`）。

| 指摘 | 重さ | 意味 |
| --- | --- | --- |
| `map-error` / `map-not-image` | 高 | 枠に何も出ないか、エラー画面（中継の502がCloudflareの「Bad gateway」として出る） |
| `map-hotlink-blocked` | 中 | 他サイトからの直接表示を拒否。中継表示に切り替わる |
| `map-proxy-type` | 中 | Content-Type が画像・PDFでなく、中継が受け付けない |
| `map-too-large` | 中 | 40MB超（中継の上限） |
| `map-small` | 中 | 原寸が枠より小さく、枠の半分未満にしか出ない |
| `map-multiple` | 中 | 2枚以上登録（1スキー場1枚） |
| `map-low-fill` | 低 | 縦長・横長すぎて枠の4割未満しか使わない |
| `map-low-res` | 低 | 長辺800px未満で拡大しても読めない |
| `map-pdf` | 低 | PDF。スマホで出ないことがある。同じ内容の画像があれば画像にする |
| `map-http` / `map-heavy` / `map-animated` / `map-duplicate` / `map-old-season` | 低 | 参考 |

`render` は実際の詳細画面を開いて、画像の原寸・表示サイズ・枠、中継（iframe）の応答と中身、
縦に積み重なって枠からはみ出していないか（`stacked`）を測る。headless Chromium はPDFを描かないので、
PDFは中継が 200・`application/pdf` を返すかで判定する。

## 状態

`broken`（表示できない）→ `stale-suspect`（古い・差し替えの疑い）→ `page-missing`（掲載元なし）→
`display-warn`（表示に注意）→ `ok`。マップ未登録は `no-map`。

`tasks.json` の仕事は2種類:
- `review`: 掲載元があり、候補の選び直し・差し替え・1枚への絞り込みを判断する。
- `find`: マップ未登録・掲載元なし・掲載元が開けない。公式サイトから探す。
