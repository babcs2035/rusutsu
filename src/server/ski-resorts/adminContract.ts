import { z } from "zod";
import { readingFieldsSchema } from "./readingContract";

export const skiResortIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform(value => (value === "" ? null : value));
const nonNegativeInteger = z.number().int().min(0).max(10_000_000);
const nullableNonNegativeInteger = nonNegativeInteger.nullable();
const percentage = z.number().int().min(0).max(100);
const stringList = z
  .array(z.string().trim().max(2_000))
  .max(200)
  .transform(values => [...new Set(values.filter(Boolean))]);

/**
 * 管理画面で変更を許可する SkiResort の列だけを列挙する。
 * id、リレーション、createdAt、updatedAt、yukiMagiId は含めない。
 */
export const adminSkiResortUpdateSchema = z
  .object({
    ...readingFieldsSchema.shape,
    nameJa: requiredText(300),
    nameEn: requiredText(300),
    shortName: nullableText(100),
    isActive: z.boolean(),

    prefecture: requiredText(100),
    town: requiredText(200),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),

    topElevation: nonNegativeInteger,
    baseElevation: nonNegativeInteger,
    verticalDrop: nonNegativeInteger,
    numberOfCourses: nonNegativeInteger,
    longestCourse: nonNegativeInteger,
    steepestSlope: nullableNonNegativeInteger,
    beginnersCoursesPercent: percentage,
    intermediateCoursesPercent: percentage,
    advancedCoursesPercent: percentage,
    courseImages: stringList,

    typeNotPressed: nullableNonNegativeInteger,
    typePressed: nullableNonNegativeInteger,
    typeBump: nullableNonNegativeInteger,
    angleMax: nullableNonNegativeInteger,
    angleAvg: nullableNonNegativeInteger,

    numberOfLifts: nonNegativeInteger,
    ropeways: nonNegativeInteger,
    gondolas: nonNegativeInteger,
    quadLifts: nonNegativeInteger,
    tripleLifts: nonNegativeInteger,
    pairLifts: nonNegativeInteger,
    singleLifts: nonNegativeInteger,
    otherLifts: nonNegativeInteger,
    liftCapacity: nullableNonNegativeInteger,

    weekdayOpen: nullableText(100),
    weekdayClose: nullableText(100),
    weekendOpen: nullableText(100),
    weekendClose: nullableText(100),
    timesComment: nullableText(10_000),

    website: nullableText(2_000),
    skiersPercent: percentage.nullable(),
    snowboardersPercent: percentage.nullable(),
    sources: stringList,

    descriptionShort: nullableText(10_000),
    descriptionLong: nullableText(100_000),
    outlineImages: stringList,
    condition: nullableText(1_000),
    status: nullableText(1_000),
    review: z.number().finite().min(0).max(5).nullable(),
  })
  .strict();

export const adminSkiResortRecordSchema = adminSkiResortUpdateSchema.extend({
  id: skiResortIdSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});

export const adminSkiResortUpdateRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    data: adminSkiResortUpdateSchema,
  })
  .strict()
  .superRefine(({ data }, context) => {
    if (
      data.nameRuby.length &&
      data.nameRuby.map(segment => segment.text).join("") !== data.nameJa
    ) {
      context.addIssue({
        code: "custom",
        path: ["data", "nameRuby"],
        message:
          "ふりがなの対象文字をつなげると名称（日本語）と一致する必要があります。",
      });
    }
  });

export type AdminSkiResortUpdate = z.infer<typeof adminSkiResortUpdateSchema>;
export type AdminSkiResortRecord = z.infer<typeof adminSkiResortRecordSchema>;
export type AdminSkiResortUpdateRequest = z.infer<
  typeof adminSkiResortUpdateRequestSchema
>;

export type AdminSkiResortUpdateResult =
  | { status: "updated"; resort: AdminSkiResortRecord }
  | { status: "conflict"; currentUpdatedAt: string }
  | { status: "not_found" };
