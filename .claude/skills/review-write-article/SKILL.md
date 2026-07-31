---
name: review-write-article
description: 検証済みのスキー場別 detail.json だけを根拠に、同じディレクトリの article.json を作成・更新する。「detail.jsonから記事を作って」「レビュー記事を書き直して」「article.jsonを生成して」のような依頼で使う。調査やdetail.jsonの事実確認は行わない。
---

# レビュー記事JSONの作成

`src/private/data/reviews/<resortId>/detail.json` だけを根拠に、同じディレクトリの
`article.json` を作成する。

## 入力

$ARGUMENTS

`resortId` がなければユーザーに確認する。対象カテゴリは次の7つに固定する。

`beginner` / `intermediate` / `advanced` / `moguls` / `powder` /
`tree-run` / `park`

作業前に [references/review-json-format.md](references/review-json-format.md) と
[references/article-format.md](references/article-format.md) を読む。

## 手順

1. 対象の `detail.json` を読む。
2. `resortId` が対象ディレクトリ名と一致し、7カテゴリすべてに
   `good`、`bad`、`courses` の配列があることを確認する。
3. `warn: true` の評価・コースは記事の根拠に使わず、完了報告で
   `warnReason` とともに人間確認が必要な項目として報告する。
4. `warn: false` の内容だけを自分の言葉でまとめ、7カテゴリの記事を作る。
5. `article.json` の先頭に入力と同じ `resortId` を置き、7カテゴリから
   評判の強さと来場判断への影響を基準に要点を選び、短い `full` を作る。
   7カテゴリの網羅や設備の列挙はしない。
6. 既存の `article.json` の文章を根拠として読まず、完成したJSONで上書きする。
7. 次のコマンドで形式を検証する。

```bash
node .claude/skills/review-write-article/scripts/validate-review-json.mjs \
  src/private/data/reviews/<resortId>/detail.json \
  src/private/data/reviews/<resortId>/article.json
```

## 禁止事項

- `detail.json` にない情報を追加しない。
- URLや引用文を記事本文に載せない。
- 外部レビューの文章をコピーしない。
- `warn: true` の情報を確認済みの事実として使用しない。
- カテゴリキーを省略しない。
- `good` や `bad` をオブジェクトや文字列に変えない。

## 完了報告

- 作成した `article.json` のパス
- 7カテゴリの評価
- 使用しなかった `warn: true` の項目と `warnReason`
- 根拠不足で本文または評価を空にしたカテゴリ
