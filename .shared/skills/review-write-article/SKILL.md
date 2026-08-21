---
name: review-write-article
description: 検証済みのスキー場別 detail.json だけを根拠に、来場判断に必要な事実を独立した箇条書きへ編集し、同じディレクトリの article.json を作成・更新する。「detail.jsonから記事を作って」「レビュー記事を書き直して」「article.jsonを生成して」「レビューを箇条書きにして」のような依頼で使う。調査やdetail.jsonの事実確認は行わない。
---

# スキー場レビュー記事JSONの作成

`src/private/data/reviews/<resortId>/detail.json` だけを根拠に、同じディレクトリの
`article.json` を作成する。

対象カテゴリは次の7つに固定する。

`beginner` / `intermediate` / `advanced` / `moguls` / `powder` /
`tree-run` / `park`

作業前に次の資料をすべて読む。

- [references/review-json-format.md](references/review-json-format.md)
- [references/article-format.md](references/article-format.md)

## 役割

**判定を変えず、調査記録から来場判断を変える事実だけを抜き出す。**

| 項目 | 作業 |
| --- | --- |
| `score` | `detail.json` からコピーする。判断しない |
| `full` | 全体の判断に効く独立項目を3〜5件書く |
| `reason` | カテゴリの判断に効く独立項目を2〜5件書く |
| `courses` | `detail.json` の対象だけを記事用に言い換える |
| `warn` / `warnReason` | `detail.json` から引き継ぐ |

`full` と `reason` は、次の辞書型を要素に持つ配列にする。

```json
{
  "label": "good",
  "text": "圧雪急斜面でロングターンを反復できます。"
}
```

`label` は `good` / `bad` / `description` のいずれか、`text` は独立した敬体の1文にする。
`description` キーはコース説明ですでに使うため、箇条書き本文には `text` を使う。
`label: "description"` は中立分類の名前であり、本文ではない。文字列へ箇条書き用の
`・` や `-` を含めない。UIが各辞書を箇条書きとして表示する。

`label` は文章の語調ではなく、来場判断への作用で選ぶ。

- `good`: そのカテゴリを目的に選ぶ理由になる滑走体験や利便性
- `bad`: 選ぶ判断を下げる不在、不足、制約、危険、手間
- `description`: 選ぶ判断を直接上げ下げしない地形の性格、変動条件、運用情報

`description` は、利点か欠点か判断できる事実を中立に見せるために使わない。どの配列にも
3種類を無理にそろえず、該当する事実だけを入れる。

## 箇条書きの核

箇条書きは文章を文ごとに分割したものではない。各辞書は同じ問いに答える、同じ重さの
独立した事実である。

- `label` と `text` の1組だけ表示しても意味が通る
- 項目を並べ替えても意味が壊れない
- 1項目に1つの判断材料だけを書く
- 前後をつなぐ接続詞を使わない
- なくても来場判断が変わらない項目は書かない

`そのため`、`一方`、`ただし`、`また`、`さらに`で始まる項目は禁止する。因果関係が
必要なら、原因と結果を同じ項目の中に収める。

## 手順

1. 対象の `detail.json` を読む。
2. `resortId` がディレクトリ名と一致し、7カテゴリすべてに `score`、`reason`、
   `courses`、`sources`、`warn`、`warnReason` があることを確認する。
3. 各カテゴリから、そこで滑れるもの、利用条件、来場判断に効く制約を抽出する。
4. 各事実に「これを消すと、そのカテゴリを目的に行く判断が変わるか」と問う。
   変わらない事実は捨てる。
5. `reason` を2〜5件の辞書で書き、各事実を `good` / `bad` / `description` に分類する。
   文章を短く切るのではなく、事実から組み直す。
6. 7カテゴリから影響の大きい事実だけを選び、`full` を3〜5項目で書く。
   エリアや設備の棚卸しはしない。
7. `courses` を書く。コース名と、そのコース固有の判断材料はここだけに置く。
8. `score`、`warn`、`warnReason` をコピーする。
9. 既存の `article.json` を根拠として読まず、完成したJSONで上書きする。
10. 次のコマンドを警告が0件になるまで実行する。

```bash
node .shared/skills/review-write-article/scripts/validate-review-json.mjs \
  src/private/data/reviews/<resortId>/detail.json \
  src/private/data/reviews/<resortId>/article.json
```

## 情報選択

`reason` に残す候補は次のいずれかに限る。

- そのカテゴリで実際に滑れる斜面や雪の性格
- 狙える時期、降雪条件、申請、営業時間などの利用条件
- 混雑、競争、閉鎖、移動、選択肢の少なさなどの実用的な制約
- `warn: true` のときだけ、実態と弱点を混同しないために必要な不確かさ

次の内容は削る。

- エリアや斜面をまとめて並べただけの全体紹介
- 「家族に使われています」のような利用者属性の付け足し
- 「人気です」「支持されています」のような評判の言い換え
- scoreの説明文や判定宣言
- 読者が事実から判断できる結論
- `courses` と同じ具体的な1コースの話

## 禁止事項

- `detail.json` にない情報を追加しない。外部を調べない。
- `score` を変えない。
- scoreを文章で言い直さない。
- `full` と `reason` にコース名を書かない。
- 件数、年号、媒体名、URL、引用文を記事本文に出さない。
- 全長、斜度、標高などの数値を記事本文に出さない。
- `評価`、`声`、`記録`、`実績`を主語にしない。
- `非圧雪部`、`小斜面`のように名詞へ機械的な接尾語を付けない。
- 同じ事実を同じ配列内で言い換えて繰り返さない。
- `label` に `good` / `bad` / `description` 以外を使わない。
- 肯定文か否定文かだけで `label` を決めない。来場判断への作用で分類する。
- カテゴリキーを省略しない。`score` に `null` を使わない。

## 完了報告

- 作成した `article.json` のパス
- 7カテゴリの `score`
- `warn: true` のカテゴリと `warnReason`
- validatorの警告が0件になったこと
