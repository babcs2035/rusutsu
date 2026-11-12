import { z } from "zod";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";

/**
 * スキー場ごとのリンク（resort_links）の保存単位。1リンク=1行。
 *
 * 書き手は「出どころ」ごとに自分の行だけを入れ替える。
 * - 公式リンク: スキルが、1スキー場分の `official` の行を入れ替える（scope.kind = "resort"）
 * - 外部サイト: クローラーが、そのサイトの行を全スキー場分まとめて入れ替える（scope.kind = "source"）
 * 人が直した行（admin / editRequest）は、自動の入れ替えでは変えない。
 */
export const RESORT_LINK_OFFICIAL_SOURCE = "official";
export const RESORT_LINK_AUTOMATIC_EDITOR_KINDS = ["skill", "crawler"] as const;
export const RESORT_LINK_HUMAN_EDITOR_KINDS = ["admin", "editRequest"] as const;
export const RESORT_LINK_EDITOR_KINDS = [
  ...RESORT_LINK_AUTOMATIC_EDITOR_KINDS,
  ...RESORT_LINK_HUMAN_EDITOR_KINDS,
] as const;

export const RESORT_LINK_MAX_LINKS_PER_WRITE = 5_000;
export const RESORT_LINK_MAX_BODY_BYTES = 4 * 1024 * 1024;

/** 種類・出どころ・小分類は、列を増やさずに足せるよう文字で持つ（例: busTour, orion, presale） */
const identifierSchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]{1,49}$/u, "英字で始まる50文字以内の英数字です。");

export const resortLinkTypeSchema = identifierSchema;
export const resortLinkSourceSchema = identifierSchema;

const urlSchema = z
  .string()
  .max(2_000)
  .refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "http(s) のURLです。");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(value => value || null);

export const resortLinkSchema = z.strictObject({
  id: z.string(),
  resortId: skiResortIdSchema,
  type: resortLinkTypeSchema,
  source: resortLinkSourceSchema,
  category: z.string().nullable(),
  label: z.string().nullable(),
  url: z.string(),
  note: z.string().nullable(),
  sortOrder: z.number().int(),
  editorKind: z.enum(RESORT_LINK_EDITOR_KINDS),
  editorId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResortLinkRecord = z.infer<typeof resortLinkSchema>;

export const resortLinkInputSchema = z.strictObject({
  resortId: skiResortIdSchema,
  type: resortLinkTypeSchema,
  category: identifierSchema.nullish().transform(value => value ?? null),
  label: optionalText(200),
  url: urlSchema,
  note: optionalText(500),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
export type ResortLinkInput = z.infer<typeof resortLinkInputSchema>;

const scopeSchema = z.discriminatedUnion("kind", [
  // 1スキー場の、その出どころの行
  z.strictObject({
    kind: z.literal("resort"),
    resortId: skiResortIdSchema,
    source: resortLinkSourceSchema,
  }),
  // その出どころの全スキー場分の行（外部サイトのクローラー）
  z.strictObject({ kind: z.literal("source"), source: resortLinkSourceSchema }),
]);
export type ResortLinkScope = z.infer<typeof scopeSchema>;

/** 同じリンクかどうかの判定に使うキー。これが同じ行は入れ替えても作り直さない */
export const resortLinkKey = (link: {
  resortId: string;
  type: string;
  category: string | null;
  label: string | null;
  url: string;
}) =>
  JSON.stringify([
    link.resortId,
    link.type,
    link.category,
    link.label,
    link.url,
  ]);

export const resortLinkReplaceSchema = z
  .strictObject({
    scope: scopeSchema,
    editor: z.strictObject({
      kind: z.enum(RESORT_LINK_AUTOMATIC_EDITOR_KINDS),
      id: z.string().trim().min(1).max(100),
    }),
    links: z.array(resortLinkInputSchema).max(RESORT_LINK_MAX_LINKS_PER_WRITE),
  })
  .superRefine((write, context) => {
    if (
      write.scope.kind === "source" &&
      write.scope.source === RESORT_LINK_OFFICIAL_SOURCE
    )
      context.addIssue({
        code: "custom",
        path: ["scope", "source"],
        message: "公式リンクはスキー場ごとに入れ替えます。",
      });
    const seen = new Set<string>();
    write.links.forEach((link, index) => {
      if (
        write.scope.kind === "resort" &&
        link.resortId !== write.scope.resortId
      )
        context.addIssue({
          code: "custom",
          path: ["links", index, "resortId"],
          message: "入れ替える範囲と違うスキー場のリンクです。",
        });
      const key = resortLinkKey(link);
      if (seen.has(key))
        context.addIssue({
          code: "custom",
          path: ["links", index],
          message: "同じリンクが重複しています。",
        });
      seen.add(key);
    });
  });
export type ResortLinkReplace = z.infer<typeof resortLinkReplaceSchema>;

export const resortLinkReplaceResultSchema = z.strictObject({
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  deleted: z.number().int(),
  /** 人が直した行と同じ項目だったので入れなかった件数 */
  keptHumanEdits: z.number().int(),
});
export type ResortLinkReplaceResult = z.infer<
  typeof resortLinkReplaceResultSchema
>;

export const resortLinkSummarySchema = z.strictObject({
  source: z.string(),
  type: z.string(),
  links: z.number().int(),
  resorts: z.number().int(),
});
export type ResortLinkSummary = z.infer<typeof resortLinkSummarySchema>;

export const resortLinkListResponseSchema = z.strictObject({
  links: z.array(resortLinkSchema),
});
export const resortLinkSummaryResponseSchema = z.strictObject({
  summary: z.array(resortLinkSummarySchema),
});
export const resortLinkReplaceResponseSchema = z.strictObject({
  result: resortLinkReplaceResultSchema,
});

/** 存在しないスキー場IDが含まれていたときのエラー */
export class UnknownResortLinkResortError extends Error {
  constructor(readonly resortIds: string[]) {
    super(`Unknown ski resort ids: ${resortIds.join(", ")}`);
    this.name = "UnknownResortLinkResortError";
  }
}
