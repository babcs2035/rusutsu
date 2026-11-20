---
name: review-research-write-publish
description: スキー場1件について、利用者レビューの調査（detail.json）、読みやすい箇条書き記事の執筆（article.json）、引用の実在確認と独立監査、本番DBへの反映までを通しで行う。「〇〇スキー場のレビューを作って」「レビューを調査から書き直して本番に反映して」「detail.jsonとarticle.jsonを両方作って」「レビューを一気通貫で作って」のような依頼で使う。複数のスキー場をまとめて頼まれたときも使う。検証済みのdetail.jsonから記事だけを書き直す依頼は review-write-article を使う。
---

# スキー場レビューの調査・執筆・本番反映

1スキー場につき、次の2ファイルを作って本番へ保存する。

```
src/private/data/reviews/<resortId>/detail.json    調査記録（評価・理由・出典）
src/private/data/reviews/<resortId>/article.json   画面に出る箇条書き
```

求められているのは2つ。**嘘を書かないこと**と、**行ったことのない人が一度読んで分かること**。
前者は調査の決まりと機械照合と独立監査で、後者は書き方と読み直しで担保する。

| 読むもの | いつ |
| --- | --- |
| [references/research-prompt.md](references/research-prompt.md) | 調査担当が調査の前に全文。親は detail.json を検査するときに §4〜§6・§18・§20 |
| [references/writing.md](references/writing.md) | 親が article.json を書く前に全文 |

## 分担

プロジェクトの `AGENTS.md` のコスト方針に従い、サブエージェントは `gpt-6-luna` に統一し、
同時に動かすのは2体までにする。

| 作業 | 担当・推論量 | 成果物 |
| --- | --- | --- |
| 対象の確定、担当への指示 | 親 | resortId、公式URL、リフト本数、作業ディレクトリ |
| 利用者レビューの調査 | Luna / medium。リフト4本以上は2体に分ける | カテゴリ別の部分JSON |
| 引用の実在確認 | `verify-quotes.mjs` | 照合結果。見つからない引用は調査担当が直す |
| detail.json の検査と採否 | 親 | 評価基準に照らして確認した detail.json |
| article.json の執筆 | **親** | article.json |
| 初見読みと裏取りの独立監査 | Luna / medium（調査担当とは別の1体） | 引っかかった文、根拠のない文の一覧 |
| 監査の反映、本番との差分確認、反映 | 親 | 本番へ保存された2ファイル |

記事の執筆は委任しない。読みやすさがこのスキルの成果物そのもので、調査記録のどの事実を
選び、どの強さで言うかの判断が文の質を決めるため、`AGENTS.md` の「記事生成は委任」の例外とする。
調査は範囲が広く並列にできるので委任する。監査は書いた本人では見落とすので別の担当に読ませる。

委任ツールや指定モデルが使えないときは親が続け、その制約を報告する。

## 1. 対象を確定する

- `src/private/data/SkiResorts.json` から `id` と公式URLを取る。`resortId` はこの `id` と
  ディレクトリ名に必ず一致させる（一致しないと本番反映が拒否される）。
- リフト本数を `src/private/data/resorts-finalized/lifts/<resortId>*` か公式サイトで確かめる。
  調査量の目標（4本以上は40〜60件、3本以下は25〜35件）と、調査担当を分けるかが決まる。
- 作業ディレクトリは `src/private/data/resorts-temporary/tmp/review/<resortId>/`。
- 既存の `detail.json` と `article.json` は読まない。前回の評価や言い回しに引きずられる。
  上書きしてよいかは、依頼に書かれていなければ確かめる。

## 2. 調査する（調査担当）

リフト4本以上のスキー場は2体に分ける。3本以下は1体で7カテゴリを担当する。

| 担当 | カテゴリ |
| --- | --- |
| A（圧雪） | `beginner` / `intermediate` / `advanced` |
| B（圧雪以外・設備） | `moguls` / `powder` / `tree-run` / `park` |

担当へは次だけを渡す。会話の経緯や既存の記事は渡さない。

```
<スキー場名>（resortId: <id>、公式: <URL>、リフト<n>本）の利用者レビューを調査し、
<カテゴリ> の調査結果をJSONで書き出してください。

1. 最初に .shared/skills/review-research-write-publish/references/research-prompt.md を全文読み、
   その決まりに従う。調査量の目標は全体<40〜60|25〜35>件のうち、担当カテゴリの分。
   件数は利用者の異なるページ数で数える（同じページを複数カテゴリで使った延べ数ではない）。
   媒体を広げる：個人ブログ、スキー場巡り系サイト、滑走記録サイト、口コミサイト、
   YAMAP・ヤマレコ、YouTubeの説明欄。Shift_JIS・EUCのページは iconv で変換して読む。
2. 出力は <作業ディレクトリ>/research-<a|b>.json。形は
   { "research": { "date": "<今日>", "note": "担当範囲の調査状況" }, "<カテゴリ>": { score, reason, courses, sources, warn, warnReason }, ... }
   担当カテゴリだけを入れる。sources の各要素は type / url / description / quote の4キーを
   必ず持つ（official でも quote は空文字で入れる）。
3. quote はページを開いたその場で本文から写す。言い換えない、つなぎ合わせない、
   「…」で省略しない。写せない出典（動画の音声、画像の文字、読めない投稿）は quote を空文字にし、
   description に何を見たかを書く。検索結果の抜粋だけで読んでいないページは出典にしない。
4. reason は後で記事を書く材料になる。場所の名前（山・エリア・コース）、数字（距離・斜度・本数・
   時刻・月）、条件（曜日・天候・時期）、誰の体験か（レベル・同行者）を、読んだとおりに残す。
   主張ごとに「誰が・いつ」を添え、1人が1日に見ただけの話と、複数の人・シーズンで繰り返される
   話の区別が付くようにする。同じページや同じスレッドの中にある反対の意見も残す。
   別々の出典の話を1つの文につなげて、どの出典にも無い主張を作らない。
5. コース名は現行の公式名に合わせる。
6. 書き終えたら次を実行し、missing と partial を0件にする。直せない引用は空文字にするか、
   出典ごと外す。出典を外して根拠が変わるなら score と warn も見直す。
     node .shared/skills/review-research-write-publish/scripts/verify-quotes.mjs <出力ファイル>
   unread はブラウザ等で本文を開き直して確かめ、確かめられなければ quote を空文字にする。
7. 返答は短く：各カテゴリの score と warn、利用者の出典件数、verify-quotes の最終結果、
   確かめられなかったこと。調査内容そのものは返答に書かない（ファイルにある）。
```

## 3. detail.json にまとめて検査する（親）

```bash
node .shared/skills/review-research-write-publish/scripts/check-review.mjs \
  src/private/data/reviews/<resortId> --merge <作業ディレクトリ>/research-a.json <作業ディレクトリ>/research-b.json
node .shared/skills/review-research-write-publish/scripts/verify-quotes.mjs \
  src/private/data/reviews/<resortId>/detail.json --out <作業ディレクトリ>/quotes.json
```

`verify-quotes.mjs` は親も必ず1回実行する。担当の「0件にした」という報告だけで済ませない。

そのうえで `detail.json` を通して読み、次を確かめる。ここは委任しない。

- `score` が `reason` に書かれた利用者の評価から導かれているか。公式のコース数・距離・斜度だけで
  上げていないか。情報が少ないことを理由に下げていないか（research-prompt §4）。
- 「ない」「少ない」「1か所だけ」と書く前に、言葉・媒体・年代を変えて調べた跡があるか（§6）。
- `advanced` にコブ・非圧雪が、`tree-run` に公式でない林が混ざっていないか。
- 2体に分けた場合、同じコース・同じ運用についてA・Bの記述が食い違っていないか。
- `courses` が利用者の評価から選ばれているか（`check-review.mjs` の「確認」に出る）。

足りない点は、具体的な問い（「イゾラB以外のコブを、コース名を変えて探す」など）にして
同じ調査担当へ戻す。親が推測で `reason` を書き足さない。

## 4. article.json を書く（親）

[references/writing.md](references/writing.md) を読んでから書く。材料は `detail.json` だけ。
調査の途中で見た覚えのある事実でも、`detail.json` に無ければ書かない（要るなら3へ戻って
`detail.json` に出典付きで入れる）。

1文を書くたびに、その元になった `detail.json` の記述が「何人の・いつの話か」を見る。
このスキルで実際に起きた誤りは、ほぼすべてここで生まれた。

- 1人が1日に見たことを、いつも起きることとして書いた（「朝は混みます」「空いています」）
- 別々の出典の話を1文につないだ（「朝に混み、10〜15分待つ」＝朝の話と待ち時間の話は別の人）
- 出典の数字の範囲を広げた（コース全長を「上部が続く長さ」に、平均と最大を取り違える）
- 「確認できなかった」を「ありません」と書いた
- 良い面だけ拾い、同じ文にあった悪い面を落とした（「人が少なく荒れている」→「人が少ない」）

```bash
node .shared/skills/review-research-write-publish/scripts/check-review.mjs \
  src/private/data/reviews/<resortId> --sync --print
```

`--sync` は `score`・`warn`・`warnReason` を `detail.json` から写す。記事側では `reason` と
`courses` だけを書けばよい。

エラーを0件にする。「確認」は1件ずつ読み、直すか、そのままでよい理由を言えるようにする。
指摘された語を別の語へ差し替えて消すのではなく、その文が何を伝えたいのかを `detail.json` に
戻って言い直す。そのうえで `--print` の出力を writing.md の「読み直し」の順で読む。

## 5. 独立監査（監査担当）

調査担当とは別の1体に、次を渡す。

```
スキー場レビュー記事の監査です。直さずに、見つけた点を報告してください。

1. まず次だけを実行して記事を読む（detail.json はまだ開かない）。
     node .shared/skills/review-research-write-publish/scripts/check-review.mjs src/private/data/reviews/<resortId> --print
   そのスキー場へ行ったことがない人として読み、次に当たる文を書き留める。
   - 一度で意味が取れなかった、読み返した
   - 知らない言葉、どこの話か分からない場所の言い方がある
   - 読んでも行き先選びの材料にならない（どのスキー場にも言える）
   - 同じことを別の箇所でも読んだ
2. 次に src/private/data/reviews/<resortId>/detail.json を開き、記事の全項目について、
   名前・数字・条件・言い切りの強さを支える記述が detail.json の同じカテゴリ
   （full は全カテゴリ）にあるかを確かめる。次に当たる文を書き留める。
   - detail.json に無い事実・数字・因果関係
   - 1人の体験や特定の日の話を、いつも起きることとして書いている
   - detail.json の弱点や制約で、来場判断を変えるのに記事に無いもの
3. 各カテゴリについて、score を決めている主張の出典を2件まで開き、detail.json の
   reason がその出典の文脈（後続の否定、対象コース、投稿者のレベル、特定日の話か）を
   取り違えていないか確かめる。△ や「ない」という判断は、公式ページも1件開いて確かめる。

返答は、[読みにくい / 根拠なし / 言い過ぎ / 書き漏れ / 出典の取り違え] の種類、
該当箇所（例 powder.reason[1]）、理由、根拠にした detail.json の記述またはURL、の一覧。
問題が無い項目は書かない。
```

親は指摘を1件ずつ判断する。記事の指摘は `detail.json` に戻って書き直し、出典の取り違えは
`detail.json` を直して（必要なら調査担当へ戻して）記事にも反映する。直した後は
`check-review.mjs` をもう一度通す。監査の指摘を採らない場合は理由を完了報告に書く。

## 6. 本番へ反映する

本番への保存は、依頼に「本番へ反映」と明示されているときだけ行う。「レビューを作って」
だけなら、差分の確認までで止めて報告する。

```bash
mise run reviews:publish -- --resort <resortId> --plan <作業ディレクトリ>/plan.json
mise run reviews:publish -- --resort <resortId> --plan <作業ディレクトリ>/plan.json --apply
```

1行目は保存せず、本番の現在値との差分を出す。対象IDと、2ファイルとも意図した内容に
なっていることを確かめてから2行目を実行する。本番が先に更新されていて止まった場合は、
本番側の変更を確かめてから1行目からやり直す。設定は `docs/d0008_content-publishing-guide.md` にある。

## 複数のスキー場を頼まれたとき

- サブエージェントは調査・監査を合わせて全体で同時に2体まで。起動の前に、いま動いている数を数える。小さいスキー場2件を1体ずつ並べるか、大きいスキー場1件を
  A・Bで並べる。調査を待つ間に、親は調査が済んだスキー場の検査と執筆を進める。
- 1件ごとに6まで終えてから次へ進む必要はないが、途中で区切って報告を挟まず、全件を終える。
- 作業ディレクトリと `--plan` はスキー場ごとに分ける。

## 完了条件

- `check-review.mjs` のエラーが0件で、「確認」はすべて読んで判断済み
- 親が実行した `verify-quotes.mjs` で missing と partial が0件
- 独立監査の指摘をすべて判断済み
- （反映を頼まれた場合）`--apply` が成功した

## 完了報告

- スキー場ごとの7カテゴリの `score` と、`warn: true` のカテゴリとその理由
- 利用者の出典件数と、引用照合の結果（ok / unread / noquote の件数）
- 独立監査で直した点、採らなかった指摘とその理由
- 調べても確かめられなかったこと
- 本番へ反映したか、差分確認で止めたか
