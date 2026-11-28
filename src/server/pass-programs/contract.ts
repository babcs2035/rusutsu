import { z } from "zod";
import { PASS_PROGRAM_IDS } from "@/shared/passPrograms";

export const PASS_PROGRAM_MAX_BODY_BYTES = 512 * 1024;

const httpUrl = z
  .string()
  .max(2_000)
  .refine(value => /^https?:\/\//u.test(value), "http(s) のURLです。");

/** 手元のクローラーが送る、1サービス分の対象スキー場一覧（名寄せはAPI側で本番DBのスキー場に対して行う） */
export const passProgramSyncSchema = z.strictObject({
  programId: z.enum(PASS_PROGRAM_IDS),
  entries: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(200),
        url: httpUrl.nullable(),
        prefecture: z.string().max(20).nullable(),
      }),
    )
    .min(1)
    .max(2_000),
  /** true なら書き込まず、差分だけを返す */
  dryRun: z.boolean(),
  /** 件数が半分未満に減っても反映する */
  allowShrink: z.boolean().default(false),
});
export type PassProgramSync = z.infer<typeof passProgramSyncSchema>;

export const passProgramSyncResultSchema = z.object({
  programId: z.string(),
  dryRun: z.boolean(),
  /** 今の本番の件数 → 今回の件数 */
  before: z.number().int(),
  total: z.number().int(),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  /** 名寄せ先が変わった名前 */
  rematched: z.array(
    z.object({
      name: z.string(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  ),
  unmatched: z.array(
    z.object({ name: z.string(), candidates: z.array(z.string()) }),
  ),
  /** NSDキッズのリンク集（resort_links、source=nsdKids）へ入れる件数 */
  links: z.number().int().nullable(),
  /** 件数が半分未満に減ったので書き込まなかった */
  shrinkBlocked: z.boolean(),
});
export type PassProgramSyncResult = z.infer<typeof passProgramSyncResultSchema>;
