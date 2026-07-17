---
name: review-verify-detail
description: src/private/data/reviews/<スキー場スラッグ> 配下の7カテゴリ（beginner/intermediate/advanced/moguls/powder/tree-run/park）の detail.md を検証する（引用の実在・URL対応・切り取り方・一時的事象の恒久化・悪い評価の独立ソース数）。不十分ならWebを再調査して detail.md を修正する。article.md は作らない。「〇〇スキー場のdetail.mdを検証して」「detail.mdの引用が正しいか確認して」のような依頼で使う。detail.mdがまだ無い初回調査は review-research-detail、検証済みdetail.mdから記事を作りたい場合は review-write-article を使う。
context: fork
---

# detail.md 検証・修正（review-verify-detail）

対象スキー場の `src/private/data/reviews/<slug>/` について、
**検証 → 再調査・修正** を行う。article.md の作成はこのSkillの範囲外。

## 入力

$ARGUMENTS

上記にスキー場スラッグが渡されていればそれを使う。渡されていなければユーザーに確認する。
対象カテゴリは次の7つ（存在しないカテゴリはスキップし、最後に報告する）:

`beginner` / `intermediate` / `advanced` / `moguls` / `powder` / `tree-run` / `park`

## ワークフロー

### Phase 1: detail.md の検証

7カテゴリすべての `detail.md` を読み、各カテゴリごとに以下を確認する。
詳細な手順とチェックリストは [references/verification.md](references/verification.md) を必ず読むこと。

1. **引用の実在確認** — 引用が元ページ本文に実在し、URLと引用が対応しているか。
   検索結果のスニペットで済ませず、必ず WebFetch で元ページ本文を取得して照合する。
2. **切り取り方・解釈の確認** — 引用が文脈を歪めていないか。原文の限定条件や逆接を落としていないか。
3. **一時的事象の恒久化チェック** — その日の天候・降雪・混雑を、スキー場の恒久的な特徴として扱っていないか。
4. **悪い評価の独立ソース確認** — 悪い評価に十分な数の独立したソース（別人・別サイト）があるか。1人の不満だけを根拠にしていないか。
5. **確度ラベルの形式確認** — 各主張の確度が「高」「中」「低」の単一値になっているか。複合ラベルがあれば主張を分割する。

### Phase 2: 再調査と detail.md の修正

Phase 1 で不備が見つかったカテゴリは、Webを再調査して `detail.md` を修正・追記する。

- 検索スニペットだけを根拠にしない。**必ず元ページ本文を確認する**。
- **利用者レビューを主な根拠**とする。
- **公式サイトの使用は限定する**: コース名、距離・斜度などの設備データ、
  現在のコース・リフト構成、公式に許可されたツリーラン範囲の確認のみ。
  公式の宣伝表現を評価の根拠にしない。
- 裏付けが取れなかった主張は削除するか「判断を保留した内容」へ移す。

## 完了報告

最後に以下を報告する:

- カテゴリごとの検証結果（問題なし / 修正した内容の要約）
- detail.md を修正・追記したファイルと理由
- 裏付けが取れず削除・保留にした主張
- article.md 作成が必要であれば `review-write-article` を使うよう案内する
