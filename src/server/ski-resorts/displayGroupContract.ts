import { z } from "zod";
import { skiResortIdSchema } from "./adminContract";

/**
 * 詳細画面の「〇〇も同時に表示」で合わせて見るスキー場の組。
 * 表示名（例: ニセコ全山）がなければ、相手の名前を並べて出す。
 */

const labelSchema = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .transform(value => (value ? value : null));

export const displayGroupMemberSchema = z.object({
  id: skiResortIdSchema,
  nameJa: z.string(),
  shortName: z.string().nullable(),
  /** 組の中での表示名（例: 志賀高原どうしなら「焼額山」）。null なら短縮名 */
  label: z.string().nullable().default(null),
});

export const displayGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().nullable(),
  members: z.array(displayGroupMemberSchema),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type DisplayGroup = z.infer<typeof displayGroupSchema>;

export const displayGroupSaveRequestSchema = z
  .strictObject({
    /** 既存の組を更新するときだけ指定する */
    id: z.string().min(1).optional(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
    label: labelSchema,
    /** スキー場ごとの表示名。空欄・省略なら短縮名 */
    memberLabels: z.record(skiResortIdSchema, labelSchema).default({}),
    resortIds: z
      .array(skiResortIdSchema)
      .min(2)
      .max(50)
      .refine(
        ids => new Set(ids).size === ids.length,
        "対象のスキー場が重複しています。",
      ),
  })
  .superRefine((request, context) => {
    if (Boolean(request.id) !== Boolean(request.expectedUpdatedAt))
      context.addIssue({
        code: "custom",
        path: ["expectedUpdatedAt"],
        message: "更新には取得時の更新日時が必要です。",
      });
  });
export type DisplayGroupSaveRequest = z.input<
  typeof displayGroupSaveRequestSchema
>;

export const displayGroupDeleteRequestSchema = z.strictObject({
  id: z.string().min(1),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});
export type DisplayGroupDeleteRequest = z.infer<
  typeof displayGroupDeleteRequestSchema
>;

export const displayGroupSaveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), group: displayGroupSchema }),
  z.object({
    status: z.enum([
      "conflict",
      "not_found",
      "invalid_resorts",
      "duplicate",
      "unsupported_labels",
    ]),
  }),
]);
export type DisplayGroupSaveResult = z.infer<
  typeof displayGroupSaveResultSchema
>;

export const displayGroupDeleteResultSchema = z.object({
  status: z.enum(["deleted", "conflict", "not_found"]),
});
export type DisplayGroupDeleteResult = z.infer<
  typeof displayGroupDeleteResultSchema
>;
