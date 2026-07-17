---
name: review-write-article
description: 検証済みの src/private/data/reviews/<スキー場スラッグ>/<category>/detail.md をもとに、各カテゴリの article.md とスキー場直下の full_article.md を新規作成する。detail.md の検証・修正は行わない（前提として済んでいるものとして扱う）。「〇〇スキー場のdetail.mdからarticle.mdを作って」「記事を書き起こして」のような依頼で使う。detail.mdの中身がまだ信用できるか分からない場合は先に review-verify-detail を使う。
context: fork
---

# article.md 作成（review-write-article）

検証済みの `src/private/data/reviews/<slug>/<category>/detail.md` **だけ**を根拠に、
各カテゴリの `article.md` とスキー場直下の `full_article.md` を新規作成する。

detail.md の検証・再調査はこのSkillの範囲外。detail.md の内容がまだ信用できるか分からない場合は、先に `review-verify-detail` を使うようユーザーに案内してから進める。

## 入力

$ARGUMENTS

上記にスキー場スラッグが渡されていればそれを使う。渡されていなければユーザーに確認する。
対象カテゴリは次の7つ（存在しないカテゴリはスキップし、最後に報告する）:

`beginner` / `intermediate` / `advanced` / `moguls` / `powder` / `tree-run` / `park`

## ワークフロー

### Phase 1: カテゴリ別 article.md の作成

各カテゴリの `detail.md` を読み、その内容**だけ**を根拠に、各カテゴリフォルダへ`article.md` を新規作成する。フォーマットと文章ルールは
[references/article-format.md](references/article-format.md) に従う。

- 既存の `article.md` があっても**読まずに上書きする**（旧文章に引っ張られない）。
- `detail.md` にない情報を追加しない。引用・URLを載せない。

### Phase 2: スキー場直下のfull_article.md の作成

7カテゴリの内容を統合し、スキー場直下に `full_article.md` を作成する
原則3段落（全体の性格と向いている人 / 主な強み / 主な気になる点）。
具体的なコース名は使わず、位置関係・エリア構成・斜面の傾向・動線で説明する。
詳細は [references/article-format.md](references/article-format.md) を参照。

## 完了報告

最後に以下を報告する:

- 作成した article.md（カテゴリ別）と full_article.md（スキー場直下）の一覧と各カテゴリの評価（◎/○/△）
- detail.md の内容だけでは判断が難しかった箇所（あれば）
