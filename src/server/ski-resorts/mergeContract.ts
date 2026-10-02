import { z } from "zod";
import { adminSkiResortRecordSchema, skiResortIdSchema } from "./adminContract";

/** MERGED は1件にまとめ、LINKED はピンを分けたまま地図・料金・レビューを共有する。 */
export const resortLinkKindSchema = z.enum(["MERGED", "LINKED"]);
export type ResortLinkKind = z.infer<typeof resortLinkKindSchema>;

/**
 * 連携エリアの ID・名称・集計値の引き継ぎ元は画面に出ないので、省略すると自動で決める。
 * 完全統合は結合後の1件として公開するので、すべて指定する。
 */
export const resortMergeRequestSchema = z
  .strictObject({
    kind: resortLinkKindSchema.default("MERGED"),
    id: skiResortIdSchema.optional(),
    nameJa: z.string().trim().min(1).max(300).optional(),
    nameEn: z.string().trim().min(1).max(300).optional(),
    primaryId: skiResortIdSchema.optional(),
    sources: z
      .array(
        z.strictObject({
          id: skiResortIdSchema,
          expectedUpdatedAt: z.iso.datetime({ offset: true }),
        }),
      )
      .min(2)
      .max(100),
  })
  .superRefine((request, context) => {
    const ids = request.sources.map(source => source.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "結合対象が重複しています。",
      });
    if (request.kind === "MERGED")
      for (const key of ["id", "nameJa", "nameEn", "primaryId"] as const)
        if (request[key] === undefined)
          context.addIssue({
            code: "custom",
            path: [key],
            message:
              "完全統合では結合後のID・名称・引き継ぎ元を指定してください。",
          });
    if (request.primaryId !== undefined && !ids.includes(request.primaryId))
      context.addIssue({
        code: "custom",
        path: ["primaryId"],
        message: "基本情報の引き継ぎ元を結合対象から選んでください。",
      });
    if (request.id !== undefined && ids.includes(request.id))
      context.addIssue({
        code: "custom",
        path: ["id"],
        message: "結合後のIDには新しいIDを指定してください。",
      });
  });

type NamedResort = { id: string; nameJa: string; nameEn: string };

/** 連携エリアの既定値。名称は所属スキー場名をつなぎ、引き継ぎ元は最初のスキー場。 */
export function linkedAreaDefaults(members: NamedResort[]) {
  const [first] = members;
  return {
    idCandidates: (suffixes: number) =>
      Array.from(
        { length: suffixes },
        (_, index) =>
          `${first.id.slice(0, 180)}-area${index ? `-${index + 1}` : ""}`,
      ),
    nameJa: members
      .map(member => member.nameJa)
      .join("・")
      .slice(0, 300),
    nameEn: members
      .map(member => member.nameEn)
      .join(" & ")
      .slice(0, 300),
    primaryId: first.id,
  };
}

export const resortMergeResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    resort: adminSkiResortRecordSchema,
    sources: z.array(adminSkiResortRecordSchema),
  }),
  z.object({ status: z.enum(["conflict", "id_exists", "invalid_sources"]) }),
]);
export type ResortMergeRequest = z.input<typeof resortMergeRequestSchema>;
export type ResortMergeResult = z.infer<typeof resortMergeResultSchema>;

const expectedResortSchema = z.strictObject({
  id: skiResortIdSchema,
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

/** 連携エリアの親を指定する。子は切り離し、親は非公開にしてデータを残す。 */
export const resortUnlinkRequestSchema = expectedResortSchema;
export type ResortUnlinkRequest = z.infer<typeof resortUnlinkRequestSchema>;
export const resortUnlinkResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unlinked"),
    resort: adminSkiResortRecordSchema,
    sources: z.array(adminSkiResortRecordSchema),
  }),
  z.object({ status: z.enum(["conflict", "not_linked"]) }),
]);
export type ResortUnlinkResult = z.infer<typeof resortUnlinkResultSchema>;

/** set は選んだスキー場を1つの共通券グループにし、clear は1件をグループから外す。 */
export const ticketGroupRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("set"),
    resorts: z
      .array(expectedResortSchema)
      .min(2)
      .max(100)
      .refine(
        resorts =>
          new Set(resorts.map(resort => resort.id)).size === resorts.length,
        "共通券の対象が重複しています。",
      ),
  }),
  z.strictObject({ action: z.literal("clear"), resort: expectedResortSchema }),
]);
export type TicketGroupRequest = z.infer<typeof ticketGroupRequestSchema>;
export const ticketGroupResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("updated"),
    resorts: z.array(adminSkiResortRecordSchema),
  }),
  z.object({ status: z.enum(["conflict", "invalid_resorts"]) }),
]);
export type TicketGroupResult = z.infer<typeof ticketGroupResultSchema>;

/** 合算できる件数だけを合算し、割合・営業時間などは引き継ぎ元を使う。 */
export function mergeResortSummary<
  T extends z.infer<typeof adminSkiResortRecordSchema>,
>(primary: T, members: T[]) {
  const sum = (
    key:
      | "numberOfCourses"
      | "numberOfLifts"
      | "ropeways"
      | "gondolas"
      | "quadLifts"
      | "tripleLifts"
      | "pairLifts"
      | "singleLifts"
      | "otherLifts",
  ) => members.reduce((total, resort) => total + resort[key], 0);
  const topElevation = Math.max(...members.map(resort => resort.topElevation));
  const baseElevation = Math.min(
    ...members.map(resort => resort.baseElevation),
  );
  return {
    ...primary,
    topElevation,
    baseElevation,
    verticalDrop: topElevation - baseElevation,
    longestCourse: Math.max(...members.map(resort => resort.longestCourse)),
    numberOfCourses: sum("numberOfCourses"),
    numberOfLifts: sum("numberOfLifts"),
    ropeways: sum("ropeways"),
    gondolas: sum("gondolas"),
    quadLifts: sum("quadLifts"),
    tripleLifts: sum("tripleLifts"),
    pairLifts: sum("pairLifts"),
    singleLifts: sum("singleLifts"),
    otherLifts: sum("otherLifts"),
    liftCapacity: members.every(resort => resort.liftCapacity !== null)
      ? members.reduce((total, resort) => total + (resort.liftCapacity ?? 0), 0)
      : null,
    courseImages: [...new Set(members.flatMap(resort => resort.courseImages))],
    outlineImages: [
      ...new Set(members.flatMap(resort => resort.outlineImages)),
    ],
    sources: [...new Set(members.flatMap(resort => resort.sources))],
  };
}
