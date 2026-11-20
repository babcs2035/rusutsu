// 公開施設 query の入力を制限し，料金条件を業務処理へ渡せる型へ解析する．
import { z } from "zod";
import {
  TICKET_PARTY_CATEGORIES,
  TICKET_RENTAL_ITEMS,
  TICKET_RENTAL_SPORTS,
} from "@/features/lift-ticket/types";

export const resortIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const maxPartyCount = 1000;
const duration = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("day"), withNight: z.boolean() }),
  z.object({ kind: z.literal("night") }),
  z.object({ kind: z.literal("hours"), hours: z.number().positive() }),
]);
export const resortPriceQuerySchema = z.object({
  resortIds: z.array(resortIdSchema).max(500),
  input: z.object({
    visitDate: date,
    usePreference: z.enum(["full_day", "half_day"]),
    today: date.optional(),
    days: z
      .array(z.object({ id: z.string().max(200), date, duration }))
      .max(31)
      .optional(),
    party: z
      .array(
        z.object({
          id: z.string().max(200),
          category: z.enum(TICKET_PARTY_CATEGORIES),
          baseCategory: z
            .enum([
              "preschool",
              "elementary",
              "junior_high",
              "high_school",
              "university",
              "adult",
            ])
            .optional(),
          age: z.number().int().nonnegative().nullable(),
          count: z.number().int().nonnegative().max(maxPartyCount),
          rental: z
            .object({
              sport: z.enum(TICKET_RENTAL_SPORTS),
              items: z
                .array(z.enum(TICKET_RENTAL_ITEMS))
                .max(TICKET_RENTAL_ITEMS.length),
            })
            .nullable()
            .optional(),
        }),
      )
      .max(50),
  }),
});
export const resortDetailsQuerySchema = z
  .object({
    ids: z.array(resortIdSchema).min(1).max(8),
    single: z.boolean().default(false),
  })
  .refine(value => !value.single || value.ids.length === 1);
export const resortMapsQuerySchema = z.object({
  ids: z.array(resortIdSchema).min(1).max(4),
});
export const resortLinksQuerySchema = z.object({
  groups: z.array(z.array(resortIdSchema).min(1).max(20)).min(1).max(8),
});
export const resortGroupQuerySchema = z.object({
  resortId: resortIdSchema,
  groupId: z.string().min(1).max(200),
});
