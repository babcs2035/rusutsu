import { z } from "zod";
import { REVIEW_CATEGORY_IDS } from "@/features/reviews/types";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";

const text = z.string().max(1_000_000);
const source = z.strictObject({ name: text, url: text, quote: text });
const item = z.object({
  description: text,
  sources: z.array(source).max(1000),
  warn: z.boolean(),
  warnReason: text.nullable(),
});
const evaluation = item.extend({ title: text }).strict();
const course = item.extend({ name: text }).strict();
const detailCategory = z.strictObject({
  good: z.array(evaluation).max(5000),
  bad: z.array(evaluation).max(5000),
  courses: z.array(course).max(5000),
});
const articleCategory = z.strictObject({
  score: z.enum(["◎", "○", "△"]).nullable(),
  good: text,
  bad: text,
  courses: z.array(z.strictObject({ name: text, description: text })).max(5000),
});
const researchSource = z.strictObject({
  type: z.enum(["review", "official"]),
  url: text.min(1),
  description: text,
  quote: text,
});
const researchCategory = z.strictObject({
  score: z.enum(["◎", "○", "△"]),
  reason: text.min(1),
  courses: z
    .array(
      z.strictObject({
        name: text,
        description: text,
        sources: z.array(researchSource).max(1000),
      }),
    )
    .max(5000),
  sources: z.array(researchSource).max(1000),
  warn: z.boolean(),
  warnReason: text.nullable(),
});
const bullet = z.strictObject({
  label: z.enum(["good", "bad", "description"]),
  text: text.min(1),
});
const bulletCategory = z.strictObject({
  score: z.enum(["◎", "○", "△"]),
  reason: z.array(bullet).min(1).max(100),
  courses: z.array(z.strictObject({ name: text, description: text })).max(5000),
  warn: z.boolean(),
  warnReason: text.nullable(),
});
const categories = <T extends z.ZodType>(schema: T) =>
  Object.fromEntries(REVIEW_CATEGORY_IDS.map(id => [id, schema])) as Record<
    (typeof REVIEW_CATEGORY_IDS)[number],
    T
  >;

export const reviewContentSchema = z
  .strictObject({
    resortId: skiResortIdSchema,
    detail: z.strictObject({
      resortId: skiResortIdSchema,
      research: z.strictObject({ date: text, note: text }),
      ...categories(z.union([detailCategory, researchCategory])),
    }),
    article: z.strictObject({
      resortId: skiResortIdSchema,
      full: z.union([text, z.array(bullet).min(1).max(100)]),
      ...categories(z.union([articleCategory, bulletCategory])),
    }),
  })
  .superRefine((value, context) => {
    if (
      value.detail.resortId !== value.resortId ||
      value.article.resortId !== value.resortId
    )
      context.addIssue({
        code: "custom",
        message: "2つのJSONのresortIdが対象スキー場と一致していません。",
      });
    for (const category of REVIEW_CATEGORY_IDS) {
      const detail = value.detail[category];
      const article = value.article[category];
      const entries =
        "good" in detail
          ? [...detail.good, ...detail.bad, ...detail.courses]
          : [detail];
      for (const entry of entries) {
        if (entry.warn ? !entry.warnReason?.trim() : entry.warnReason !== null)
          context.addIssue({
            code: "custom",
            message: `${category}: warnとwarnReasonが一致していません。`,
          });
      }
      if (
        "reason" in article &&
        "reason" in detail &&
        (article.score !== detail.score ||
          article.warn !== detail.warn ||
          article.warnReason !== detail.warnReason)
      )
        context.addIssue({
          code: "custom",
          message: `${category}: 記事のscore・warn・warnReasonは調査結果と一致させてください。`,
        });
    }
    if (
      new TextEncoder().encode(JSON.stringify(value)).length >
      4 * 1024 * 1024
    )
      context.addIssue({
        code: "custom",
        message: "レビューは合計4 MiB以内にしてください。",
      });
  });
const hash = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .nullable();
export const reviewPublicationSchema = z.strictObject({
  content: reviewContentSchema,
  expectedHashes: z.strictObject({ detail: hash, article: hash }),
});
export type ReviewPublication = z.infer<typeof reviewPublicationSchema>;
