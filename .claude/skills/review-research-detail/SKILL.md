---
name: review-research-detail
description: 指定されたスキー場について、利用者レビュー・口コミ・滑走記録・SNS投稿などをWeb上で幅広く調査し、7カテゴリ（beginner/intermediate/advanced/moguls/powder/tree-run/park）ごとの detail.md を src/private/data/reviews/<slug>/ 配下に新規作成する。detail.md がまだ存在しないスキー場の初回調査（フェーズ1）に使う。「〇〇スキー場のレビューを調査して」「〇〇のdetail.mdを作って」のような依頼で使う。detail.md が既にあり検証だけしたい場合は review-verify-detail、article.mdを作りたいだけなら review-write-article を使う。
context: fork
---

# レビュー調査・detail.md作成（review-research-detail）

対象スキー場について利用者レビューをWebで調査し、7カテゴリの `detail.md` を
`src/private/data/reviews/<slug>/<category>/detail.md` として新規作成する。

このSkillは**フェーズ1（ゼロからの調査・detail.md作成）専任**。
detail.md 完成後の検証は `review-verify-detail`、article.md作成は
`review-write-article` に引き継ぐ。article.md はこのSkillでは作らない。

## 入力

$ARGUMENTS

上記にスキー場名・スラッグが渡されていればそれを使う。渡されていない、または
スラッグが未指定の場合は、正式名称から適切な英字スラッグを決めてユーザーに確認する
（このSkillは`context: fork`でサブエージェントとして実行されるため、ユーザーへの確認は
完了報告に含める形で行い、必要なら呼び出し元にスラッグ確定を差し戻す）。

対象カテゴリ:
`beginner` / `intermediate` / `advanced` / `moguls` / `powder` / `tree-run` / `park`

## 基本方針

- **利用者の声を主根拠とする。** スキー場レビューサイト、個人ブログ、滑走記録、旅行記、
  YouTube動画の説明文・字幕・文字起こし、SNS投稿、スキー・スノーボードコミュニティの
  実体験談を使う。
- 公式サイトは、正式コース名・現行コースマップ・パーク設置場所・公式ツリーランエリア・
  営業ルール・リフト構成の確認にのみ使う。宣伝文句を評価の根拠にしない。
- **検索結果のスニペットだけで判断しない。** 必ずWebFetchで元ページ本文または投稿内容を
  開いて確認する。本文が確認できない・削除された・引用元不明なページは使わない。
- **引用を捏造しない。** 元ページに実在する文章だけを引用する。意味を変えたり複数箇所を
  つなげたりしない。引用は主張を裏付けるために必要な短い範囲に限定する。

カテゴリの定義（コブ／ツリーラン／パーク）と各カテゴリの調査観点、一時的条件の除外基準は
[references/categories.md](references/categories.md) を必ず読んで従うこと。
調査量・独立ソースの数え方・確度の付け方は
[references/sourcing-and-confidence.md](references/sourcing-and-confidence.md) を必ず読んで従うこと。
detail.md のフォーマットは [references/detail-format.md](references/detail-format.md) に厳密に従う。

## ワークフロー

必ずこの順番で進める。調査完了前に detail.md 本文を書き始めない。

1. スキー場の正式名称・所在地を確認する。
2. 利用者レビューを幅広く収集する（目標: スキー場全体で40〜60件の独立ソース、
   各カテゴリ10〜20件程度）。件数を満たすために関連性の低い投稿や重複情報を追加しない。
3. WebFetchで元ページ本文または投稿内容を確認する。スニペットだけの採用はしない。
4. 一時的な感想（その日の天候・雪質・混雑・規制）と構造的な特徴を分離する。
   基準は [references/categories.md](references/categories.md) の「一時的条件の除外」を参照。
5. 情報を7カテゴリに分類する。カテゴリごとの調査観点・用語定義は
   [references/categories.md](references/categories.md) を参照。
6. 各カテゴリの `detail.md` を作成する。フォーマットは
   [references/detail-format.md](references/detail-format.md) に厳密に従う。
7. 引用・URL・投稿日・主張の対応を自己点検する（引用が実在するか、URLと引用が対応しているか、
   検索スニペットだけを根拠にしていないか）。
8. 根拠が弱い情報（1ソースのみ、内容が曖昧、時期が古く現状不明）を除外するか、
   「判断を保留した内容」に移す。

存在しないカテゴリ（情報が確認できなかった場合）は、無理に件数を埋めず
「確認できる利用者情報が不足している」と明記する。

## 完了報告

最後に以下を報告する:

- 作成した `detail.md` の一覧（`src/private/data/reviews/<slug>/<category>/detail.md`）
- 確認した独立利用者ソースの総数と、カテゴリごとの内訳
- カテゴリごとの主な確度（高/中/低の傾向）
- 判断を保留した内容
- 人間による確認を推奨する箇所（ソースが薄い、確度が低いなど）

detail.md作成後、検証が必要であれば `review-verify-detail` を、article.md作成が
必要であれば（検証後に）`review-write-article` を使うよう案内する。
