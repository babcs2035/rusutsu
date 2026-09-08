import { z } from "zod";

export const nameRubySchema = z
  .array(
    z.strictObject({
      text: z.string().min(1).max(300),
      ruby: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .nullish()
        .transform(value => value ?? undefined),
    }),
  )
  .max(100);
export const formerNamesSchema = z
  .array(
    z
      .strictObject({
        name: z.string().trim().min(1).max(300),
        nameRuby: nameRubySchema.optional(),
        reading: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .nullish()
          .transform(value => value ?? undefined),
      })
      .superRefine((entry, context) => {
        if (
          (entry.nameRuby?.map(segment => segment.ruby ?? segment.text).join("")
            .length ?? 0) > 300
        ) {
          context.addIssue({
            code: "custom",
            path: ["nameRuby"],
            message: "旧称のふりがな全体は300文字以内で入力してください。",
          });
        }
        if (
          entry.nameRuby?.length &&
          entry.nameRuby.map(segment => segment.text).join("") !== entry.name
        ) {
          context.addIssue({
            code: "custom",
            path: ["nameRuby"],
            message:
              "ふりがなの対象文字をつなげると旧称と一致する必要があります。",
          });
        }
      })
      .transform(entry =>
        entry.nameRuby === undefined
          ? entry
          : {
              ...entry,
              reading: entry.nameRuby.length
                ? entry.nameRuby
                    .map(segment => segment.ruby ?? segment.text)
                    .join("")
                : undefined,
            },
      ),
  )
  .max(100);

export const readingFieldsSchema = z.object({
  nameRuby: nameRubySchema,
  formerNames: formerNamesSchema,
  readingNeedsReview: z.boolean(),
});

export const readingRelationsSelect = {
  nameRuby: {
    select: { text: true, ruby: true },
    orderBy: { position: "asc" as const },
  },
  formerNames: {
    select: {
      name: true,
      reading: true,
      nameRuby: {
        select: { text: true, ruby: true },
        orderBy: { position: "asc" as const },
      },
    },
    orderBy: { position: "asc" as const },
  },
} as const;
