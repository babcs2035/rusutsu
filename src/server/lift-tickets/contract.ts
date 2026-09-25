import { z } from "zod";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";

/**
 * リフト券料金（1スキー場 × 1シーズン）の保存単位。
 * 文書の構造そのものは Skill の検証3本が正本で、ここでは保存の単位
 * （スキー場・シーズン・状態・版）と、文書が自分の単位と一致することだけを見る。
 */
export const LIFT_TICKET_MAX_CONTENT_BYTES = 8 * 1024 * 1024;
export const LIFT_TICKET_STATUSES = [
  "complete",
  "needs_review",
  "failed",
] as const;

export const liftTicketSeasonIdSchema = z
  .string()
  .regex(/^\d{4}-\d{4}$/u, "シーズンIDは YYYY-YYYY 形式です。")
  .refine(
    value => Number(value.slice(5)) === Number(value.slice(0, 4)) + 1,
    "シーズンIDは連続する2年です。",
  );

const documentSchema = z.record(z.string(), z.unknown());

export const liftTicketSeasonSummarySchema = z.strictObject({
  resortId: skiResortIdSchema,
  seasonId: liftTicketSeasonIdSchema,
  status: z.enum(LIFT_TICKET_STATUSES),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

export const liftTicketSeasonSchema = liftTicketSeasonSummarySchema.extend({
  data: documentSchema,
});

export type LiftTicketSeasonSummary = z.infer<
  typeof liftTicketSeasonSummarySchema
>;
export type LiftTicketSeason = z.infer<typeof liftTicketSeasonSchema>;

/** 保存時に文書から読む単位。resort.id / season.id / data_quality.status */
const documentIdentitySchema = z.object({
  resort: z.object({ id: z.string() }),
  season: z.object({ id: z.string() }),
  data_quality: z.object({ status: z.enum(LIFT_TICKET_STATUSES) }),
});

export const liftTicketSeasonWriteSchema = z
  .strictObject({
    resortId: skiResortIdSchema,
    seasonId: liftTicketSeasonIdSchema,
    data: documentSchema,
    // null は「まだ登録されていないこと」を期待する新規作成。
    expectedVersion: z.number().int().positive().nullable(),
  })
  .superRefine((write, context) => {
    const identity = documentIdentitySchema.safeParse(write.data);
    if (!identity.success) {
      context.addIssue({
        code: "custom",
        path: ["data"],
        message: "resort.id / season.id / data_quality.status が必要です。",
      });
      return;
    }
    if (identity.data.resort.id !== write.resortId)
      context.addIssue({
        code: "custom",
        path: ["data", "resort", "id"],
        message: "resort.id が保存先のスキー場IDと一致しません。",
      });
    if (identity.data.season.id !== write.seasonId)
      context.addIssue({
        code: "custom",
        path: ["data", "season", "id"],
        message: "season.id が保存先のシーズンIDと一致しません。",
      });
    if (
      new TextEncoder().encode(serializeLiftTicket(write.data)).byteLength >
      LIFT_TICKET_MAX_CONTENT_BYTES
    )
      context.addIssue({
        code: "custom",
        path: ["data"],
        message: "リフト券JSONは8 MiB以内にしてください。",
      });
  });

export type LiftTicketSeasonWrite = z.infer<typeof liftTicketSeasonWriteSchema>;

export const statusOfLiftTicket = (data: Record<string, unknown>) =>
  documentIdentitySchema.parse(data).data_quality.status;

export const liftTicketSeasonGetResponseSchema = z.strictObject({
  season: liftTicketSeasonSchema.nullable(),
});
export const liftTicketSeasonListResponseSchema = z.strictObject({
  seasons: z.array(liftTicketSeasonSummarySchema),
});
export const liftTicketSeasonDataResponseSchema = z.strictObject({
  seasons: z.array(liftTicketSeasonSchema),
});
export const liftTicketSeasonWriteResponseSchema = z.strictObject({
  season: liftTicketSeasonSchema,
});
export const liftTicketConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal("VERSION_CONFLICT"),
    details: z.object({ actualVersion: z.number().int().nullable() }),
  }),
});

export class LiftTicketConflictError extends Error {
  constructor(readonly actualVersion: number | null) {
    super("Lift ticket season changed after it was read");
    this.name = "LiftTicketConflictError";
  }
}

/**
 * ローカルのバックアップJSONと管理画面の保存は同じ書式にそろえる。
 * DB列は json 型でキー順を保つので、読み書きしても差分は実際の変更だけになる。
 */
export const serializeLiftTicket = (data: Record<string, unknown>) =>
  `${JSON.stringify(data, null, 2)}\n`;
