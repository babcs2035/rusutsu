# レビューJSON形式

## detail.json

```json
{
  "resortId": "rusutsu-resort",
  "research": {
    "date": "2026-07-14",
    "note": "調査に関する報告"
  },
  "beginner": {
    "good": [
      {
        "title": "評価の見出し",
        "description": "評価の説明",
        "sources": [
          {
            "name": "出典名",
            "url": "https://example.com",
            "quote": "確認に使った原文"
          }
        ],
        "warn": false,
        "warnReason": null
      }
    ],
    "bad": [],
    "courses": [
      {
        "name": "コース名",
        "description": "コースの説明",
        "sources": [],
        "warn": true,
        "warnReason": "人間が確認すべき理由"
      }
    ]
  },
  "intermediate": { "good": [], "bad": [], "courses": [] },
  "advanced": { "good": [], "bad": [], "courses": [] },
  "moguls": { "good": [], "bad": [], "courses": [] },
  "powder": { "good": [], "bad": [], "courses": [] },
  "tree-run": { "good": [], "bad": [], "courses": [] },
  "park": { "good": [], "bad": [], "courses": [] }
}
```

必須条件:

- `good` と `bad` は必ず配列。
- `courses` は必ず配列。
- `warn` は必ずboolean。
- `warn: true` なら `warnReason` は空でない文字列。
- `warn: false` なら `warnReason` は `null`。
- `sources` は必ず配列。

## article.json

```json
{
  "resortId": "rusutsu-resort",
  "full": "スキー場全体の記事",
  "beginner": {
    "score": "◎",
    "good": "初心者向けの良い点",
    "bad": "初心者向けの悪い点",
    "courses": [
      {
        "name": "コース名",
        "description": "記事用のコース説明"
      }
    ]
  },
  "intermediate": { "score": "○", "good": "", "bad": "", "courses": [] },
  "advanced": { "score": "○", "good": "", "bad": "", "courses": [] },
  "moguls": { "score": "△", "good": "", "bad": "", "courses": [] },
  "powder": { "score": "◎", "good": "", "bad": "", "courses": [] },
  "tree-run": { "score": "○", "good": "", "bad": "", "courses": [] },
  "park": { "score": null, "good": "", "bad": "", "courses": [] }
}
```

7カテゴリすべてを必ず含める。`score` は `◎`、`○`、`△`、`null` のいずれか。
