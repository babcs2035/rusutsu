# レビューJSON形式

カテゴリキーは次の7つに固定する。

`beginner` / `intermediate` / `advanced` / `moguls` / `powder` / `tree-run` / `park`

## detail.json（入力・調査側が作る）

```json
{
  "resortId": "hiroshima-kenmin-no-mori",
  "research": {
    "date": "2026年7月14日",
    "note": "調査全体の状況"
  },
  "advanced": {
    "score": "○",
    "reason": "みずならコース上部について幅が広く圧雪が丁寧という評価が2017年・2013年・2025年の3件で確認でき、カービング練習の場所として繰り返し挙げられている。一方ぶなコースは2022年・2025年・2026年の記録でいずれも非圧雪として扱われており、圧雪の上級コースは実質1本。◎ではなく○とした理由は、みずなら上部への評価は安定しているが整地された上級斜面を選び分けられる構成ではないため。",
    "courses": [
      {
        "name": "みずならコース",
        "description": "1,100mの中・上級コース。上部の幅広い圧雪斜面がロングターンの主要エリア",
        "sources": []
      }
    ],
    "sources": [
      {
        "type": "review",
        "url": "https://example.com/entry/1",
        "description": "2025年11月の滑走記。みずなら上部の圧雪の丁寧さとぶなの非圧雪について記述",
        "quote": "圧雪も丁寧"
      },
      {
        "type": "official",
        "url": "https://example.com/activity",
        "description": "現行コース・リフト一覧。全4コース・2リフト。パーク記載なし（2026-07-14確認）",
        "quote": ""
      }
    ],
    "warn": false,
    "warnReason": null
  }
}
```

必須条件:

- 7カテゴリすべてに `score` / `reason` / `courses` / `sources` / `warn` / `warnReason` がある
- `score` は `◎` `○` `△` のいずれか。**`null` は使わない**
- `reason` は空でない文字列。長さ制限なし。そのscore以上になる理由と、一段上の
  scoreにならない理由を書く。`◎` では最高評価の基準を満たす理由を書く
- `courses` は配列。要素は `name` / `description` / `sources`
- `sources` は配列。要素は `type` / `url` / `description` / `quote` の4キーのみ
- `type` は `"review"` か `"official"`
- `url` は空でない
- `quote` は `description` と同一にしてはならない（要約を引用欄に入れた状態）
- `warn` はboolean。`true` なら `warnReason` は具体的な文字列、`false` なら `null`
- `warnReason` に定型文を使わない（同じ文字列を複数カテゴリで使い回さない）

`detail.json` は調査記録であり、字数や読みやすさを整えない。
`reason` には件数・年代・媒体を書く。

## article.json（出力・このskillが作る）

```json
{
  "resortId": "hiroshima-kenmin-no-mori",
  "full": [
    {
      "label": "good",
      "text": "幅の広い圧雪中斜面が、山頂側から麓まで続きます。"
    },
    {
      "label": "description",
      "text": "自然コブは積雪や圧雪で形が変わります。"
    },
    {
      "label": "bad",
      "text": "圧雪された急斜面は一つだけです。"
    }
  ],
  "advanced": {
    "score": "○",
    "reason": [
      {
        "label": "good",
        "text": "幅の広い圧雪急斜面が、山頂側から長く続きます。"
      },
      {
        "label": "bad",
        "text": "ほかの上級斜面はコブ・非圧雪が中心です。"
      }
    ],
    "courses": [
      {
        "name": "みずならコース",
        "description": "上部は幅の広い圧雪急斜面で、麓側まで長く続きます。"
      }
    ],
    "warn": false,
    "warnReason": null
  }
}
```

必須条件:

- 7カテゴリすべてを含める
- `score` は **`detail.json` と完全に一致させる**。記事側で判定を変えない
- `full` は辞書配列。3〜5項目
- `reason` は辞書配列。2〜5項目
- 各辞書は `label` / `text` の2キーのみ
- `label` は `good` / `bad` / `description` のいずれか
- `text` は独立した敬体の1文。12〜45字で句点を付ける
- `text` にMarkdownの箇条書き記号を含めない
- `courses` は `name` / `description` の2キーのみ。`sources` を持たない
- `warn` / `warnReason` は `detail.json` からそのまま引き継ぐ
- `resortId` は `detail.json` と一致
- `sources` を持たない（URLや引用を記事に出さない）
