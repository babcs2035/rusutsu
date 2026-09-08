import { z } from "zod";
import { adminSkiResortRecordSchema, skiResortIdSchema } from "./adminContract";

export const resortMergeRequestSchema = z
  .strictObject({
    id: skiResortIdSchema,
    nameJa: z.string().trim().min(1).max(300),
    nameEn: z.string().trim().min(1).max(300),
    primaryId: skiResortIdSchema,
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
    if (!ids.includes(request.primaryId))
      context.addIssue({
        code: "custom",
        path: ["primaryId"],
        message: "基本情報の引き継ぎ元を結合対象から選んでください。",
      });
    if (ids.includes(request.id))
      context.addIssue({
        code: "custom",
        path: ["id"],
        message: "結合後のIDには新しいIDを指定してください。",
      });
  });

export const resortMergeResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    resort: adminSkiResortRecordSchema,
    sources: z.array(adminSkiResortRecordSchema),
  }),
  z.object({ status: z.enum(["conflict", "id_exists", "invalid_sources"]) }),
]);
export type ResortMergeRequest = z.infer<typeof resortMergeRequestSchema>;
export type ResortMergeResult = z.infer<typeof resortMergeResultSchema>;

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
