# crawl_latest 全国実行監査（2026-09-05）

## 実行条件

- 実行日時: 2026-09-05 08:15〜08:18 JST
- 対象: `src/private/scripts/crawl_latest/resorts` の実行対象93件
- 除外: `template.ts`、`*_before.ts`、テスト
- モード: ローカルファイル（本番API・本番DBへの書き込みなし）
- 同時実行数: 4
- 1件のtimeout: 180秒
- 実行場所: 作業ツリーを汚さない一時コピー

## 結果

| 結果 | 件数 | 最新値への昇格 |
|---|---:|---|
| 正常 | 70 | ローカルJSONへ保存 |
| 警告 | 21 | しない |
| 失敗 | 2 | しない |
| timeout | 0 | しない |

警告・失敗の23件では診断manifestとレンダリング後DOMを保存できた。取得途中で
結果自体を作れなかった黒伏高原を除き、隔離された`raw-result.json`も保存できた。

9月のオフシーズン表示に対する実行結果であるため、「警告＝必ずコードの故障」ではない。
ただし、空欄や予想外の表示を正常値として公開しない安全装置が働いたことは確認できた。
各クローラーを直すか、公式に確認できるオフシーズン規則を追加するかは、営業中の公式DOMと
照合して判断する。

## 警告21件

| スキー場 | 検出内容 |
|---|---|
| 秋田八幡平スキー場 (`akita-hachimantai`) | 2コースと1リフトの状態が空。中腹の天気・気温・積雪・降雪・雪質・風速も空 |
| あさひプライムスキー場 (`asahi-prime`) | 第1・第2リフトの状態が空 |
| あわすのスキー場 (`awasuno`) | リフトを0件しか取得できなかった |
| ぶどうスノーリゾート (`budoh`) | 営業情報セクションが見つからず、5コースの状態が空。リフトと天気も0件 |
| 富良野スキー場 (`furano`) | `スノーエスカレーター`が2件あり、リフト名が重複 |
| 夏油高原スキー場 (`geto-kogen`) | 3リフトの状態画像が見つからず状態が空。山麓の気温・風速も空 |
| ひだ流葉スキー場 (`hida-nagareha`) | 天気を0件しか取得できなかった |
| ほおのき平スキー場 (`hounokidaira`) | 天気を0件しか取得できなかった |
| いぶきの里スキー場 (`ibukinosato`) | 必須のコンディション欄とリフト欄が見つからなかった |
| カムイスキーリンクス (`kamui-ski-links`) | 天気データ提供元を利用できなかった |
| かたしな高原スキー場 (`katashina-kogen`) | トップは滑走可能率0%だが、営業情報ページには営業中のコース・リフトが10行あり矛盾 |
| まつだいファミリースキー場 (`matsudai-family`) | 天気を0件しか取得できなかった |
| みやぎ蔵王白石スキー場 (`miyagi-zao-shiroishi`) | リフトと天気を0件しか取得できなかった |
| Mt.乗鞍スノーリゾート (`mt-norikura-snow-resort`) | 未登録のリフト表示`point9 style2`。`commentUrl`も配列ではない |
| 奥只見丸山スキー場 (`okutadami-maruyama`) | 天気を0件しか取得できなかった |
| パルコール嬬恋リゾートスキー場 (`pallcall-tsumagoi-resort`) | 嬬恋ゴンドラの状態が空 |
| 札幌国際スキー場 (`sapporo-kokusai`) | 天気を0件しか取得できなかった |
| 志賀高原 奥志賀高原スキー場 (`shiga-kogen-okushiga-kogen`) | 天気を0件しか取得できなかった |
| Mt.T by 星野リゾート (`tanigawadake-tenjindaira`) | スキー場地点の風速が空 |
| となみ夢の平スキー場 (`tonami-yumenotaira`) | 天気を0件しか取得できなかった |
| わかさ氷ノ山スキー場 (`wakasa-hyonosen`) | 天気を0件しか取得できなかった |

## 実行失敗2件

| スキー場 | 検出内容 |
|---|---|
| 星野リゾート ネコマ マウンテン (`hoshino-resorts-nekoma-mountain`) | トップページの必須要素を30秒以内に取得できずnavigation失敗。確認済みオフシーズン用フォールバックは動いたが、天気は空 |
| 黒伏高原スノーパーク ジャングル・ジャングル (`kurobushi-kogen-snow-park-jangle-jungle`) | 営業情報URLがHTTP 404で、必須要素も15秒以内に見つからず、天気・コース・リフトを取得できなかった |

## 今後の再実行

1件だけローカルで確認する例:

```bash
mise run crawl:latest -- --local-files \
  --resort rusutsu-resort \
  --report var/crawler-artifacts/local-reports/rusutsu-resort.json
```

全件をローカルで再確認する例:

```bash
mise run crawl:latest -- --local-files \
  --report var/crawler-artifacts/local-reports/latest.json
```

本番DBへ送信する`--remote-api`は、本番APIの段階導入試験と専用schedulerだけで使用する。
