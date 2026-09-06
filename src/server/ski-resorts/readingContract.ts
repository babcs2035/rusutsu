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
    z.strictObject({
      name: z.string().trim().min(1).max(300),
      reading: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .nullish()
        .transform(value => value ?? undefined),
    }),
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
    select: { name: true, reading: true },
    orderBy: { position: "asc" as const },
  },
} as const;
